'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-wave20-'));
const sandboxSecret=crypto.randomBytes(48).toString('hex');
process.env.DB_PATH=path.join(dir,'live.sqlite');
process.env.PZ_TEST_WAVE20_KEY=sandboxSecret;
process.env.PZ_PLATFORMS_FILE=path.join(dir,'platforms.json');
fs.writeFileSync(process.env.PZ_PLATFORMS_FILE,JSON.stringify([{key:'sandbox_lab',name:'Песочница проверки подписей',url:'http://127.0.0.1:8790/',mode:'sandbox',secretEnv:'PZ_TEST_WAVE20_KEY',capabilities:['sandbox']} ]));
const {server,db}=require('../src/server');
const {reviewSubmission}=require('../src/submissions');
const {openDatabase}=require('../src/database');
const AUDIT=require('../src/commercial-audit');
let base,owner,reviewer,viewer,outsider,mutator,brief,root,child,packId,dlvId;
function client(){
  let cookie='';
  return async(route,method='GET',obj)=>{
    const headers={};if(cookie)headers.cookie=cookie;
    if(obj!==undefined)headers['content-type']='application/json';
    const r=await fetch(base+route,{method,headers,redirect:'manual',body:obj===undefined?undefined:JSON.stringify(obj)});
    if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
    const type=r.headers.get('content-type')||'';
    return{status:r.status,body:type.includes('json')?await r.json():await r.text(),headers:r.headers,cookie};
  };
}
const input={brand:'DESIGN TEAM 20',title:'Пример услуг небольшой дизайн-студии',category:'Дизайн и коммуникации',short:'Помогаем командам увидеть результаты работы студии без недоказанных заявлений об эффективности.',audience:'Дизайн-отделы небольших компаний, выбирающие подрядчиков',promise:'Представить услуги студии с подтверждаемыми примерами проектов',evidence:'Примеры работ должны проходить проверку прав и фактов перед публикацией.',visual:'Контрастная сетка, крупные текстовые блоки, проверенные иллюстрации',hook:'Посмотрите наши реальные работы',tone:'Деловой',cta:'Открыть портфолио студии',website:'',contactEmail:'',contactConsent:false,rightsConfirmed:true,publicConfirmed:true};
before(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  owner=client();reviewer=client();viewer=client();outsider=client();mutator=client();
  for(const c of [owner,reviewer,viewer,outsider,mutator])assert.equal((await c('/api/bootstrap')).status,200);
  brief=(await owner('/api/business-briefs','POST',input)).body.id;
  root=reviewSubmission(db,brief,'approved','Тестовый рекламный бриф изучен и одобрен вручную в тестовой базе').rootId;
  child=(await mutator('/api/mutations','POST',{parentId:root,gene:'hook',value:'Знакомство с работой дизайн-студии без громких обещаний'})).body.id;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});

test('WAVE 16: one-time invitations, isolated roles, and restricted team workspace',async()=>{
  const pathBase='/api/business-briefs/'+brief;
  assert.equal((await outsider(pathBase+'/team/invites','POST',{role:'reviewer',days:7})).status,403);
  assert.equal((await owner(pathBase+'/team/invites','POST',{role:'admin',days:7})).status,400);
  const a=await owner(pathBase+'/team/invites','POST',{role:'reviewer',days:7});
  assert.equal(a.status,201);assert.match(a.body.joinPath,/^\/team\/join\/[A-Za-z0-9_-]{43}$/);
  const token=a.body.joinPath.split('/').at(-1);
  assert(!JSON.stringify(await owner(pathBase+'/team')).includes(token),'invite token must never leak in owner listing');
  assert.equal((await reviewer('/api/team/redeem','POST',{token})).status,201);
  assert.equal((await outsider('/api/team/redeem','POST',{token})).body.code,'TEAM_TOKEN_EXPIRED');
  assert.equal((await reviewer('/api/team/'+brief+'/workspace')).body.role,'reviewer');
  assert.equal((await outsider('/api/team/'+brief+'/workspace')).status,403);
  assert.equal((await reviewer(pathBase+'/team')).status,403,'member must not see manager console');
  assert.equal((await reviewer(pathBase+'/control')).status,403,'member cannot operate campaigns');
  assert.equal((await reviewer(pathBase+'/packs','POST',{label:'Переопределить материалы',purpose:'internal',branchIds:[child]})).status,403);
  const b=await owner(pathBase+'/team/invites','POST',{role:'viewer',days:1});
  assert.equal((await viewer('/api/team/redeem','POST',{token:b.body.joinPath.split('/').at(-1)})).body.role,'viewer');
  assert.equal((await viewer('/api/team/'+brief+'/workspace')).status,200);
  assert.equal((await reviewer('/team/'+brief)).status,200,'direct team route must refresh');
  assert.equal((await outsider('/team/join/'+token)).status,200,'invite links must be accessible directly');
});

test('WAVE 16: team notes require reviewer and cannot disclose owner private drafts',async()=>{
  const r=await owner('/api/business-briefs/'+brief+'/packs','POST',{branchIds:[child],label:'Предложения для честного клиентского обзора',purpose:'client_review'});
  assert.equal(r.status,201);packId=r.body.id;
  assert.equal((await viewer('/api/team/'+brief+'/notes','POST',{packId,text:'Просмотрел предложение, считаю полезным.'})).status,403);
  assert.equal((await outsider('/api/team/'+brief+'/notes','POST',{packId,text:'Хочу оставлять записи на чужих работах.'})).status,403);
  assert.equal((await reviewer('/api/team/'+brief+'/notes','POST',{packId,text:'Проверить формулировку призыва с заказчиком.'})).status,201);
  const workspace=(await viewer('/api/team/'+brief+'/workspace')).body;
  assert.equal(workspace.packs.length,1);assert.equal(workspace.notes.length,1);
  assert(!JSON.stringify(workspace).includes('contact_email'));
  assert.equal((await reviewer('/api/packs/'+packId)).status,403,'original owner-only pack route preserved');
  const management=(await owner('/api/business-briefs/'+brief+'/team')).body;
  const rmember=management.members.find(m=>m.role==='reviewer');
  assert.equal((await owner('/api/business-briefs/'+brief+'/team/members/'+rmember.memberId+'/revoke','POST',{})).status,200);
  assert.equal((await reviewer('/api/team/'+brief+'/workspace')).status,403,'revocation takes effect immediately');
  assert.equal((await viewer('/api/team/'+brief+'/notes','POST',{packId,text:'Нельзя повысить свою роль.'})).status,403);
});

test('WAVE 16: expired and revoked invitations are not reusable and no token is logged',async()=>{
  const a=(await owner('/api/business-briefs/'+brief+'/team/invites','POST',{role:'viewer',days:1})).body;
  const token=a.joinPath.split('/').at(-1);
  db.prepare('UPDATE team_invitations SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',a.id);
  assert.equal((await outsider('/api/team/redeem','POST',{token})).status,410);
  const b=(await owner('/api/business-briefs/'+brief+'/team/invites','POST',{role:'viewer',days:1})).body;
  assert.equal((await owner('/api/business-briefs/'+brief+'/team/invites/'+b.id+'/revoke','POST',{})).status,200);
  assert.equal((await outsider('/api/team/redeem','POST',{token:b.joinPath.split('/').at(-1)})).status,410);
  const row=db.prepare('SELECT token_hash FROM team_invitations WHERE id=?').get(a.id);
  assert.notEqual(row.token_hash,token);assert.equal(row.token_hash.length,64);
});

test('WAVE 17: immutable deliverables export escaped offline HTML and can be downloaded only by members',async()=>{
  const url='/api/business-briefs/'+brief+'/deliverables';
  assert.equal((await viewer(url,'POST',{packId,label:'Нежелательная попытка выпуска документа'})).status,403);
  assert.equal((await outsider(url)).status,403);
  const created=await owner(url,'POST',{packId,label:'Подборка для первого обсуждения с клиентом'});
  assert.equal(created.status,201);dlvId=created.body.id;
  assert.equal(created.body.content.source.variants.length,1);
  assert.equal((await viewer('/api/deliverables/'+dlvId)).status,200);
  const html=await viewer('/api/deliverables/'+dlvId+'/download');
  assert.equal(html.status,200);assert.match(html.headers.get('content-disposition'),/attachment; filename="DLV-/);
  assert.match(html.body,/Творческие варианты на согласование/);assert.match(html.body,/SHA-256/);
  assert(!/<script|onerror=|<iframe/i.test(html.body));
  assert.equal((await outsider('/api/deliverables/'+dlvId+'/download')).status,403);
  const prev=db.prepare('SELECT snapshot_json FROM campaign_deliverables WHERE id=?').get(dlvId).snapshot_json;
  db.prepare('UPDATE campaign_deliverables SET snapshot_json=? WHERE id=?').run('{"tampered":true}',dlvId);
  assert.equal((await owner('/api/deliverables/'+dlvId)).body.code,'DELIVERABLE_TAMPERED');
  db.prepare('UPDATE campaign_deliverables SET snapshot_json=? WHERE id=?').run(prev,dlvId);
  assert.equal((await owner('/api/deliverables/'+dlvId)).status,200);
});

test('WAVE 18: sandbox receipts never count as live events; reports cannot invent revenue',async()=>{
  const beforeReport=(await owner('/api/business-briefs/'+brief+'/evidence')).body;
  assert.equal(beforeReport.current.count.live.artifact_created,0);
  const oldDossier=await owner('/api/business-briefs/'+brief+'/evidence','POST',{});
  assert.equal(oldDossier.status,201);assert.equal(oldDossier.body.snapshot.count.sandbox.artifact_created,0);
  // Fixtures represent rows normally inserted only after verified partner callbacks; existing integration tests verify the signature gate.
  const sessionCookie=(await mutator('/api/bootstrap')).cookie;
  const sid=sessionCookie.split('=')[1].split('.')[0];
  const id=crypto.randomBytes(24).toString('base64url');
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO handoffs(id,branch_id,owner_session,platform_key,platform_mode,source,snapshot_json,created_at,expires_at)
    VALUES(?,?,?,?,?,'public','{}',?,?)`).run(id,child,sid,'sandbox_lab','sandbox',now,new Date(Date.now()+86400000).toISOString());
  db.prepare('INSERT INTO partner_receipts(platform_key,event_id,handoff_id,action_type,partner_object_id,environment) VALUES(?,?,?,?,?,?)')
    .run('sandbox_lab','wave20-sandbox-event-001',id,'artifact_created','sandbox-creative','sandbox');
  const report=(await owner('/api/business-briefs/'+brief+'/evidence')).body.current;
  assert.equal(report.count.sandbox.artifact_created,1);assert.equal(report.count.live.artifact_created,0);
  assert(!JSON.stringify(report).includes('sandbox-creative'));
  const snapshot=(await owner('/api/business-briefs/'+brief+'/evidence','POST',{})).body;
  assert.equal(snapshot.snapshot.count.sandbox.artifact_created,1);
  assert.equal((await outsider('/api/evidence/'+snapshot.id)).status,403);
  assert.equal((await owner('/api/evidence/'+oldDossier.body.id)).body.snapshot.count.sandbox.artifact_created,0,'snapshots are immutable');
  assert.equal((await owner('/api/evidence/'+snapshot.id)).body.sha256,snapshot.sha256);
  assert.equal((await owner('/api/business-briefs/'+brief+'/launch-check')).body.livePartnerArtifactEvents,0);
});

test('WAVE 19: hash-chain detects row tampering, and no audit entries are public',async()=>{
  const p='/api/business-briefs/'+brief+'/audit';
  assert.equal((await outsider(p)).status,403);
  const report=(await owner(p)).body;
  assert.equal(report.ok,true);assert(report.events>=6);
  const first=db.prepare('SELECT id,subject_id FROM commercial_audit WHERE submission_id=? ORDER BY rowid ASC LIMIT 1').get(brief);
  db.prepare('UPDATE commercial_audit SET subject_id=? WHERE id=?').run('tampered-audit',first.id);
  assert.equal((await owner(p)).body.ok,false);
  db.prepare('UPDATE commercial_audit SET subject_id=? WHERE id=?').run(first.subject_id,first.id);
  assert.equal(AUDIT.verify(db,brief).ok,true);
});

test('WAVE 20: launch preflight reports real blockers with no fictitious payments',async()=>{
  const p='/api/business-briefs/'+brief+'/launch-check';
  assert.equal((await outsider(p)).status,403);
  const report=(await owner(p)).body;
  assert.equal(report.status,'BLOCKED');assert.equal(report.businessValidation,'NOT_VERIFIED');
  assert.equal(report.paymentIntegration,'NOT_INSTALLED');
  assert.equal(report.technicalChecks.find(c=>c.key==='deliverable').pass,true);
  assert.equal(report.technicalChecks.find(c=>c.key==='live_connected').pass,false);
  assert.equal(report.technicalChecks.find(c=>c.key==='live_receipts').pass,false);
  assert.equal(report.technicalChecks.find(c=>c.key==='audit').pass,true);
  assert(!JSON.stringify(report).includes(sandboxSecret));
});

test('WAVE 19: privacy deletion immediately removes member access and their private notes',async()=>{
  const workspacePath='/api/team/'+brief+'/workspace';
  const notes=(await viewer(workspacePath)).body;
  assert.equal(notes.role,'viewer');
  assert.equal((await viewer('/api/privacy/export')).body.teamMemberships.length,1);
  assert.equal((await viewer('/api/privacy/delete','POST',{})).status,200);
  assert.equal((await viewer(workspacePath)).status,403);
  assert.equal((await owner('/api/business-briefs/'+brief+'/team')).body.members.length,0);
  const report=(await owner('/api/business-briefs/'+brief+'/audit')).body;
  assert.equal(report.ok,true);
});

test('WAVE 20: migrations are idempotent and foreign keys remain consistent',()=>{
  require('../src/waves16-20-schema').migrateWaves1620(db);
  const status=db.prepare('PRAGMA integrity_check').get().integrity_check;
  assert.equal(status,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const isolated=openDatabase(path.join(dir,'fresh.sqlite'));
  assert.equal(isolated.prepare('PRAGMA foreign_key_check').all().length,0);
  assert(isolated.prepare("SELECT name FROM sqlite_master WHERE name='commercial_audit'").get());
  isolated.close();
});

test('WAVE 17: client HTML escapes dangerous markup even when a saved public pack contains it',async()=>{
  const old=db.prepare('SELECT hook FROM branches WHERE id=?').get(child).hook;
  const malicious='creative<img src=x onerror=alert(1)>';
  db.prepare('UPDATE branches SET hook=? WHERE id=?').run(malicious,child);
  const p=await owner('/api/business-briefs/'+brief+'/packs','POST',{branchIds:[child],label:'HTML escaping regression variant',purpose:'internal'});
  db.prepare('UPDATE branches SET hook=? WHERE id=?').run(old,child);
  assert.equal(p.status,201);
  const d=await owner('/api/business-briefs/'+brief+'/deliverables','POST',{packId:p.body.id,label:'Проверка безопасного клиентского файла'});
  assert.equal(d.status,201);
  const html=(await owner('/api/deliverables/'+d.body.id+'/download')).body;
  assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert(!html.includes('<img src=x onerror=alert(1)>'));
});

test('WAVE 18: moderation of an ancestor excludes all descendant partner receipts',async()=>{
  const {moderationSet}=require('../src/database');
  const start=(await owner('/api/business-briefs/'+brief+'/evidence')).body.current;
  assert.equal(start.count.sandbox.artifact_created,1);
  moderationSet(db,root,'hidden','Скрыто для проверки модерации корневой рекламной ветви');
  // The owner is now intentionally forbidden from viewing the campaign while it is hidden.
  assert.equal((await owner('/api/business-briefs/'+brief+'/evidence')).status,403);
  const {summary}=require('../src/partner-evidence');
  assert.throws(()=>summary(db,'intruder',brief));
  moderationSet(db,root,'visible','Возвращаем проверенную кампанию в доступ после теста');
  assert.equal((await owner('/api/business-briefs/'+brief+'/evidence')).body.current.count.sandbox.artifact_created,1);
});

test('WAVE 20: operator preflight checks production blockers without claiming deployment',()=>{
  const {execFileSync}=require('node:child_process');
  const raw=execFileSync(process.execPath,['src/ops.js','release-preflight'],{
    cwd:require('node:path').join(__dirname,'..'),
    env:{...process.env,DB_PATH:process.env.DB_PATH},encoding:'utf8'});
  const info=JSON.parse(raw);
  assert.equal(info.version,'3.4.0');
  assert.equal(info.infrastructure.ok,true);
  assert.equal(info.infrastructure.livePartnersReady,0);
  assert.equal(info.infrastructure.payments,'NOT_INSTALLED');
  assert.equal(info.productionClaim,'NOT_VERIFIED');
  assert.equal(info.integrityIssues.length,0);
});

test('WAVE 19: deleting the owner cascades team, documents, evidence without orphaned references',async()=>{
  assert.equal((await owner('/api/privacy/export')).status,200);
  const before=db.prepare('SELECT COUNT(*) AS n FROM campaign_deliverables WHERE submission_id=?').get(brief).n;
  assert(before>0);
  assert.equal((await owner('/api/privacy/delete','POST',{})).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM brand_submissions WHERE id=?').get(brief).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM campaign_deliverables WHERE submission_id=?').get(brief).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM commercial_audit WHERE submission_id=?').get(brief).n,0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal((await owner('/api/business-briefs/'+brief+'/team')).status,404);
  assert.equal((await outsider('/api/bootstrap')).status,200);
});

test('WAVE 20: live SQLite backup is created, integrity-checked, and readable independently',()=>{
  const {execFileSync}=require('node:child_process');
  const dest=path.join(dir,'recovery.sqlite');
  const output=execFileSync(process.execPath,['src/backup.js',dest],{cwd:path.join(__dirname,'..'),env:{...process.env,DB_PATH:process.env.DB_PATH},encoding:'utf8'});
  assert.match(output,/Резервная копия создана и проверена/);
  const readOnly=require('node:sqlite').DatabaseSync;
  const copy=new readOnly(dest,{readOnly:true});
  assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(copy.prepare('PRAGMA foreign_key_check').all().length,0);
  assert(copy.prepare("SELECT name FROM sqlite_master WHERE name='team_members'").get());
  copy.close();
});
