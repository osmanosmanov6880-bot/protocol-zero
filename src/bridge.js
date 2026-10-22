'use strict';
// PROTOCOL ZERO Conversion Bridge v2. No secrets are stored in the platform registry.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const { AppError, uid, getBranch, requireVisible, getWorkspace, record, enforceSessionQuota, withTransaction }=require('./database');
const VALID_ACTIONS=['artifact_created','campaign_saved'];
const MAX_AGE_SECONDS=300;
const MAX_HANDOFF_AGE_MS=30*24*3600*1000;
function loadPlatforms(root,production=false){
  const filename=process.env.PZ_PLATFORMS_FILE;
  if(!filename)return [];
  const full=path.isAbsolute(filename)?filename:path.resolve(root,filename);
  let parsed;
  try{parsed=JSON.parse(fs.readFileSync(full,'utf8'));}
  catch(err){throw new Error('Не удалось прочитать реестр платформ: '+err.message);}
  if(!Array.isArray(parsed)||parsed.length>7)throw new Error('Реестр должен содержать массив из 0–7 платформ.');
  const keys=new Set();
  return parsed.map((p,i)=>{
    if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('Некорректная платформа '+i);
    if(typeof p.key!=='string'||!/^[a-z][a-z0-9_-]{1,24}$/.test(p.key)||keys.has(p.key))throw new Error('Некорректный или повторный ключ платформы.');
    keys.add(p.key);
    if(typeof p.name!=='string'||p.name.trim().length<2||p.name.length>70)throw new Error('Некорректное название платформы.');
    if(!['sandbox','live'].includes(p.mode))throw new Error('Режим должен быть sandbox или live.');
    if(production&&p.mode==='sandbox')throw new Error('Демонстрационную платформу нельзя подключать в production.');
    if(typeof p.secretEnv!=='string'||!/^[A-Z][A-Z0-9_]{3,80}$/.test(p.secretEnv))throw new Error('Укажите имя переменной окружения secretEnv.');
    let u;
    try{u=new URL(p.url);}catch{throw new Error('Некорректный адрес '+p.key);}
    if(u.username||u.password||u.hash||!['https:','http:'].includes(u.protocol))throw new Error('URL не должен содержать пароль, фрагмент или посторонний протокол.');
    const local=['127.0.0.1','localhost','[::1]'].includes(u.hostname);
    if(u.protocol==='http:'&&(!local||production))throw new Error('HTTP разрешён только для локальной разработки.');
    if(production&&u.protocol!=='https:')throw new Error('Production интеграция требует HTTPS.');
    const secret=process.env[p.secretEnv]||'';
    if(secret&&secret.length<32)throw new Error(p.secretEnv+' должен содержать минимум 32 символа.');
    return Object.freeze({key:p.key,name:p.name.trim(),url:u.toString(),mode:p.mode,secret,capabilities:Array.isArray(p.capabilities)?p.capabilities.filter(c=>typeof c==='string'&&c.length<60).slice(0,6):[]});
  });
}
function publicPlatform(p){return {key:p.key,name:p.name,mode:p.mode,capabilities:p.capabilities,callbackConfigured:!!p.secret};}
function findPlatform(platforms,key){const p=platforms.find(x=>x.key===key);if(!p)throw new AppError('Рекламная платформа не подключена.',404,'PLATFORM_NOT_FOUND');return p;}
function campaignBrief(db,branch,source,sessionId){
  if(source!=='public'&&source!=='workspace')throw new AppError('Выберите источник рекламного материала.');
  const campaign={
    format:'protocol-zero/campaign-brief/v1',
    specimenId:branch.id,ancestorId:branch.parentId, generation:branch.generation,
    brand:branch.brand, demoBrand:['7F-001','7F-002','7F-003'].includes(branch.campaignId),
    audience:branch.audience, objective:branch.promise, evidence:branch.evidence,
    visualGuidance:branch.visual, creative:{headline:branch.hook,tone:branch.tone,cta:branch.cta},
    changedGene:branch.changedGene,
    disclaimer:'Черновая творческая идея, не утверждение об эффективности. Рекламные факты и права на контент должен проверить рекламодатель.',
    source
  };
  if(source==='workspace'){
    const saved=getWorkspace(db,branch.id,sessionId);
    campaign.creative={headline:saved.headline,tone:saved.tone,cta:saved.cta};
    campaign.editorNotes=saved.notes;
  }
  return campaign;
}
function createHandoff(db,platforms,{branchId,platformKey,source,sessionId}){
  const branch=requireVisible(db,branchId);
  if(branch.generation===0)throw new AppError('Сначала создайте собственную версию кампании.',409,'NO_OWN_BRANCH');
  if(branch.creatorSession!==sessionId)throw new AppError('Передавать рекламный бриф может только автор.',403,'NOT_OWNER');
  const platform=findPlatform(platforms,platformKey);
  const brief=campaignBrief(db,branch,source,sessionId);
  return withTransaction(db,()=>{
    enforceSessionQuota(db,sessionId,'handoff_created',15,'-1 hour');
    const id=uid(24),createdAt=new Date().toISOString(),expiresAt=new Date(Date.now()+MAX_HANDOFF_AGE_MS).toISOString();
    db.prepare(`INSERT INTO handoffs(id,branch_id,owner_session,platform_key,platform_mode,source,snapshot_json,created_at,expires_at)
     VALUES(?,?,?,?,?,?,?,?,?)`).run(id,branchId,sessionId,platform.key,platform.mode,source,JSON.stringify(brief),createdAt,expiresAt);
    record(db,'handoff_created',sessionId,branchId);
    return {id,launchPath:'/out/'+id,platform:publicPlatform(platform),source,createdAt,expiresAt,willTransfer:source==='workspace'?'Заголовок, тон, призыв и заметки частной рабочей копии':'Только публичные элементы брифа и происхождение ветви'};
  });
}
function rawHandoff(db,id){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(id))throw new AppError('Передача не найдена.',404,'HANDOFF_NOT_FOUND');
  const row=db.prepare('SELECT * FROM handoffs WHERE id=?').get(id);
  if(!row)throw new AppError('Передача не найдена.',404,'HANDOFF_NOT_FOUND');
  return row;
}
function assertActive(row){
  if(row.revoked_at)throw new AppError('Передача отозвана автором.',410,'HANDOFF_REVOKED');
  if(Date.parse(row.expires_at)<=Date.now())throw new AppError('Срок передачи истёк.',410,'HANDOFF_EXPIRED');
}
function listHandoffs(db,sessionId){
  return db.prepare(`SELECT h.id,h.branch_id AS branchId,h.platform_key AS platformKey,h.platform_mode AS platformMode,
   h.source,h.created_at AS createdAt,h.expires_at AS expiresAt,h.opened_at AS openedAt,
   h.resolved_at AS resolvedAt,h.revoked_at AS revokedAt,
   (SELECT COUNT(*) FROM partner_receipts r WHERE r.handoff_id=h.id) AS confirmedEvents
   FROM handoffs h WHERE h.owner_session=? ORDER BY h.created_at DESC,h.rowid DESC LIMIT 50`).all(sessionId);
}
function ownerHandoff(db,id,sessionId,needsVisible=true){
  const row=rawHandoff(db,id);if(row.owner_session!==sessionId)throw new AppError('Чужая передача недоступна.',403,'NOT_OWNER');
  if(needsVisible)requireVisible(db,row.branch_id);return row;
}
function revokeHandoff(db,id,sessionId){
  const row=ownerHandoff(db,id,sessionId,false);
  if(!row.revoked_at)db.prepare('UPDATE handoffs SET revoked_at=? WHERE id=?').run(new Date().toISOString(),id);
  record(db,'handoff_revoked',sessionId,row.branch_id);
  return {ok:true,revoked:true,note:'Отзыв запрещает дальнейшее получение данных. Уже полученную на стороне платформы копию он не удаляет.'};
}
function openRedirect(db,platforms,id,sessionId){
  const row=ownerHandoff(db,id,sessionId);assertActive(row);
  const p=findPlatform(platforms,row.platform_key);
  if(p.mode!==row.platform_mode)throw new AppError('Настройки платформы изменились. Создайте новую передачу.',409,'PLATFORM_CHANGED');
  // A handoff token is opaque; creative content is never sent in a browser URL.
  const dest=new URL(p.url);
  dest.searchParams.set('pz_handoff',id);
  dest.searchParams.set('utm_source','protocol_zero');
  dest.searchParams.set('utm_medium','interactive');
  dest.searchParams.set('utm_campaign','inheritance_7f');
  const update=db.prepare('UPDATE handoffs SET opened_at=? WHERE id=? AND opened_at IS NULL').run(new Date().toISOString(),id);
  if(update.changes)record(db,'handoff_opened',sessionId,row.branch_id);
  return dest.toString();
}
function secureEqual(a,b){return typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function authenticate(p,raw,headers){
  if(!p.secret)throw new AppError('Партнёрский ключ не настроен.',503,'PARTNER_SECRET_MISSING');
  const time=headers['x-pz-timestamp'];
  if(typeof time!=='string'||!/^[0-9]{10}$/.test(time)||Math.abs(Date.now()/1000-Number(time))>MAX_AGE_SECONDS)throw new AppError('Время подписанного запроса недействительно.',401,'STALE_SIGNATURE');
  const expected='sha256='+crypto.createHmac('sha256',p.secret).update(`${time}.${raw}`).digest('hex');
  if(!secureEqual(expected,headers['x-pz-signature']))throw new AppError('Неверная подпись партнёра.',401,'INVALID_SIGNATURE');
}
function authenticatePartner(platforms,headers,raw){
  const platform=findPlatform(platforms,headers['x-pz-platform']);authenticate(platform,raw,headers);return platform;
}
function resolveHandoff(db,platform,request){
  const row=rawHandoff(db,request.handoff_id);
  if(row.platform_key!==platform.key||row.platform_mode!==platform.mode)throw new AppError('Передача принадлежит другой платформе.',403,'WRONG_PARTNER');
  assertActive(row);requireVisible(db,row.branch_id);
  if(!row.opened_at)throw new AppError('Автор ещё не открыл платформу.',409,'HANDOFF_NOT_OPENED');
  db.prepare('UPDATE handoffs SET resolved_at=COALESCE(resolved_at,?) WHERE id=?').run(new Date().toISOString(),row.id);
  return {handoffId:row.id,mode:platform.mode,source:row.source,brief:JSON.parse(row.snapshot_json),expiresAt:row.expires_at};
}
function confirmReceipt(db,platform,request){
  const {handoff_id,event_id,action_type,partner_object_id}=request;
  if(typeof event_id!=='string'||event_id.length<8||event_id.length>100||!/^[A-Za-z0-9._:-]+$/.test(event_id))throw new AppError('Некорректный event_id.');
  if(!VALID_ACTIONS.includes(action_type))throw new AppError('Некорректный тип подтверждения.');
  if(typeof partner_object_id!=='string'||partner_object_id.length<6||partner_object_id.length>120||!/^[A-Za-z0-9._:-]+$/.test(partner_object_id))throw new AppError('Некорректный ID рекламного результата.');
  return withTransaction(db,()=>{
    const prior=db.prepare('SELECT handoff_id AS handoffId,action_type AS actionType,partner_object_id AS objectId FROM partner_receipts WHERE platform_key=? AND event_id=?').get(platform.key,event_id);
    if(prior){
      if(prior.handoffId!==handoff_id||prior.actionType!==action_type||prior.objectId!==partner_object_id)throw new AppError('Нельзя повторно использовать event_id для другого результата.',409,'EVENT_CONFLICT');
      return {ok:true,duplicate:true,environment:platform.mode};
    }
    const row=rawHandoff(db,handoff_id);
    if(row.platform_key!==platform.key||row.platform_mode!==platform.mode)throw new AppError('Другая платформа.',403,'WRONG_PARTNER');
    assertActive(row);requireVisible(db,row.branch_id);
    if(!row.resolved_at)throw new AppError('Платформа ещё не получила бриф.',409,'HANDOFF_NOT_RESOLVED');
    db.prepare('INSERT INTO partner_receipts(platform_key,event_id,handoff_id,action_type,partner_object_id,environment) VALUES(?,?,?,?,?,?)')
      .run(platform.key,event_id,handoff_id,action_type,partner_object_id,platform.mode);
    if(platform.mode==='live'){
      db.prepare("UPDATE branches SET action_status='verified' WHERE id=?").run(row.branch_id);
      record(db,'product_useful_action',row.owner_session,row.branch_id,'partner_webhook');
    }else record(db,'sandbox_action',row.owner_session,row.branch_id,'sandbox_webhook');
    return {ok:true,duplicate:false,environment:platform.mode};
  });
}
function bridgeStats(db){
  const cnt=q=>db.prepare(q).get().n;
  return {
    handoffsCreated:cnt('SELECT COUNT(*) AS n FROM handoffs'),
    handoffsOpened:cnt('SELECT COUNT(*) AS n FROM handoffs WHERE opened_at IS NOT NULL'),
    handoffsResolved:cnt('SELECT COUNT(*) AS n FROM handoffs WHERE resolved_at IS NOT NULL'),
    sandboxActions:cnt("SELECT COUNT(DISTINCT h.branch_id) AS n FROM partner_receipts r JOIN handoffs h ON h.id=r.handoff_id WHERE r.environment='sandbox'"),
    partnerLiveActions:cnt("SELECT COUNT(DISTINCT h.branch_id) AS n FROM partner_receipts r JOIN handoffs h ON h.id=r.handoff_id WHERE r.environment='live'")
  };
}
module.exports={loadPlatforms,publicPlatform,findPlatform,createHandoff,listHandoffs,ownerHandoff,revokeHandoff,openRedirect,authenticatePartner,resolveHandoff,confirmReceipt,bridgeStats,campaignBrief};
