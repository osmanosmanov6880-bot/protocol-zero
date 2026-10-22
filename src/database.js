'use strict';
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GENES = ['hook', 'tone', 'cta'];
const TONES = ['Спокойный', 'Дерзкий', 'Ироничный', 'Тёплый', 'Деловой'];
const REPORT_REASONS = ['spam', 'offensive', 'personal_data', 'misleading', 'other'];
const SEEDS = [
  { id:'7F-001', title:'Управлять творческим хаосом',brand:'NOVA STUDIO',category:'Командная работа',short:'Вымышленный сервис организации задач для небольшой творческой команды.',audience:'Небольшие творческие команды',promise:'Помочь команде договориться о задачах и сроках',evidence:'Демонстрационный сценарий. Реальные свойства продукта не проверены.',visual:'Типографика, бумага, яркий геометрический акцент',hook:'Хорошим идеям нужен порядок.',tone:'Спокойный',cta:'Посмотреть рабочий процесс',accent:'#c9ff66' },
  { id:'7F-002',title:'Пекарня на соседней улице',brand:'ТИХОЕ УТРО',category:'Локальный бизнес',short:'Вымышленная маленькая пекарня, которая хочет познакомиться с жителями района.',audience:'Жители соседних кварталов',promise:'Рассказать о пекарне и пригласить новых гостей',evidence:'Учебный пример. Меню и наличие товаров следует уточнить.',visual:'Тёплая фотография улицы, без искусственных скидок',hook:'Пусть утро начнётся неподалёку.',tone:'Тёплый',cta:'Познакомиться с пекарней',accent:'#f0aa78' },
  { id:'7F-003',title:'Место для новых идей',brand:'COMMON SPACE',category:'Творческое сообщество',short:'Вымышленное городское пространство для встреч и совместных проектов.',audience:'Дизайнеры, авторы, независимые создатели',promise:'Познакомить людей, которым интересно работать вместе',evidence:'Концептуальный проект. События и адрес не заявляются как реальные.',visual:'Редакционная сетка, чёрно-белые лица, неоновая линия',hook:'Не каждой идее нужен один автор.',tone:'Деловой',cta:'Узнать о сообществе',accent:'#b6a5ff' }
];
class AppError extends Error {
  constructor(message,status=400,code='BAD_REQUEST'){super(message);this.status=status;this.code=code;}
}
function uid(bytes=12){return crypto.randomBytes(bytes).toString('base64url');}
function openDatabase(filename){
  mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS campaigns(
      id TEXT PRIMARY KEY,title TEXT NOT NULL,brand TEXT NOT NULL,category TEXT NOT NULL,
      short TEXT NOT NULL,audience TEXT NOT NULL,promise TEXT NOT NULL,evidence TEXT NOT NULL,
      visual TEXT NOT NULL,accent TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS branches(
      id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      parent_id TEXT REFERENCES branches(id),generation INTEGER NOT NULL,
      changed_gene TEXT,hook TEXT NOT NULL,tone TEXT NOT NULL,cta TEXT NOT NULL,
      creator_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      action_status TEXT NOT NULL DEFAULT 'none',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(changed_gene IS NULL OR changed_gene IN ('hook','tone','cta')),
      CHECK(action_status IN ('none','reported','verified'))
    );
    CREATE INDEX IF NOT EXISTS idx_branch_parent ON branches(parent_id);
    CREATE INDEX IF NOT EXISTS idx_branch_campaign ON branches(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_branch_creator ON branches(creator_session);
    CREATE TABLE IF NOT EXISTS invites(
      token TEXT PRIMARY KEY,branch_id TEXT NOT NULL REFERENCES branches(id),
      creator_session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      used_by TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      child_id TEXT REFERENCES branches(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invite_parent ON invites(branch_id);
    CREATE TABLE IF NOT EXISTS events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'server',session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      branch_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_event_name ON events(name);
    CREATE INDEX IF NOT EXISTS idx_event_session_name_time ON events(session_id,name,created_at);
    CREATE TABLE IF NOT EXISTS platform_events(
      event_id TEXT PRIMARY KEY,branch_id TEXT NOT NULL REFERENCES branches(id),
      action_type TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS workspaces(
      branch_id TEXT PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
      owner_session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      headline TEXT NOT NULL,cta TEXT NOT NULL,tone TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_owner ON workspaces(owner_session);
    CREATE TABLE IF NOT EXISTS branch_reports(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id TEXT NOT NULL REFERENCES branches(id),
      reporter_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branch_id,reporter_session)
    );
    CREATE INDEX IF NOT EXISTS idx_report_branch ON branch_reports(branch_id);
    CREATE TABLE IF NOT EXISTS handoffs(
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL REFERENCES branches(id),
      owner_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      platform_key TEXT NOT NULL,
      platform_mode TEXT NOT NULL CHECK(platform_mode IN ('sandbox','live')),
      source TEXT NOT NULL CHECK(source IN ('public','workspace')),
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      opened_at TEXT,
      resolved_at TEXT,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_handoffs_owner ON handoffs(owner_session);
    CREATE INDEX IF NOT EXISTS idx_handoffs_branch ON handoffs(branch_id);
    CREATE TABLE IF NOT EXISTS partner_receipts(
      platform_key TEXT NOT NULL,
      event_id TEXT NOT NULL,
      handoff_id TEXT NOT NULL REFERENCES handoffs(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      partner_object_id TEXT NOT NULL,
      environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(platform_key,event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_partner_receipts_handoff ON partner_receipts(handoff_id);
    CREATE TABLE IF NOT EXISTS brand_submissions(
      id TEXT PRIMARY KEY,
      owner_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn')),
      brand TEXT NOT NULL,title TEXT NOT NULL,category TEXT NOT NULL,short TEXT NOT NULL,
      audience TEXT NOT NULL,promise TEXT NOT NULL,evidence TEXT NOT NULL,
      visual TEXT NOT NULL,hook TEXT NOT NULL,tone TEXT NOT NULL,cta TEXT NOT NULL,
      website TEXT NOT NULL DEFAULT '',contact_email TEXT NOT NULL DEFAULT '',contact_consent_at TEXT,consented_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,
      review_note TEXT,campaign_id TEXT UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_owner ON brand_submissions(owner_session,created_at);
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON brand_submissions(status,created_at);
    CREATE TABLE IF NOT EXISTS brand_review_log(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
      decision TEXT NOT NULL,reason TEXT NOT NULL,campaign_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS moderation_log(
      id INTEGER PRIMARY KEY AUTOINCREMENT,branch_id TEXT NOT NULL REFERENCES branches(id),
      old_status TEXT NOT NULL,new_status TEXT NOT NULL,reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // WAVE 2: owner-only editorial decisions are kept separate from immutable public lineage.
  db.exec(`CREATE TABLE IF NOT EXISTS brand_variant_reviews(
    submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('candidate','shortlisted','discarded')),
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(submission_id,branch_id)
  ); CREATE INDEX IF NOT EXISTS idx_variant_review_sub ON brand_variant_reviews(submission_id,status);`);
  // WAVE 3: immutable A/B design, HMAC-derived assignments and signed partner evidence.
  db.exec(`CREATE TABLE IF NOT EXISTS campaign_experiments(
    id TEXT PRIMARY KEY,submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id),platform_key TEXT NOT NULL DEFAULT '',
    metric TEXT NOT NULL CHECK(metric IN ('lead','signup','purchase')),
    hypothesis TEXT NOT NULL,control_branch TEXT NOT NULL REFERENCES branches(id),
    treatment_branch TEXT NOT NULL REFERENCES branches(id),
    control_snapshot TEXT NOT NULL,treatment_snapshot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','paused')),
    owner_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_experiment_campaign ON campaign_experiments(submission_id);
  CREATE TABLE IF NOT EXISTS experiment_assignments(
    experiment_id TEXT NOT NULL REFERENCES campaign_experiments(id) ON DELETE CASCADE,
    platform_key TEXT NOT NULL,participant_hash TEXT NOT NULL,
    arm TEXT NOT NULL CHECK(arm IN ('A','B')),
    impressed INTEGER NOT NULL DEFAULT 0 CHECK(impressed IN (0,1)),
    converted INTEGER NOT NULL DEFAULT 0 CHECK(converted IN (0,1)),
    assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,impressed_at TEXT,converted_at TEXT,
    PRIMARY KEY(experiment_id,platform_key,participant_hash)
  );
  CREATE TABLE IF NOT EXISTS experiment_event_ids(
    platform_key TEXT NOT NULL,event_id TEXT NOT NULL,
    experiment_id TEXT NOT NULL REFERENCES campaign_experiments(id) ON DELETE CASCADE,
    participant_hash TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('impression','goal')),
    arm TEXT NOT NULL CHECK(arm IN ('A','B')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(platform_key,event_id)
  );`);
  // WAVE 5: separate last-seen timestamp, preserving original first creation for audit.
  if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='last_seen_at')){
    db.exec('ALTER TABLE sessions ADD COLUMN last_seen_at TEXT; UPDATE sessions SET last_seen_at=created_at WHERE last_seen_at IS NULL;');
  }
  // Non-destructive migration for existing v1.0.0 databases. Keep the original data.
  const columns=db.prepare('PRAGMA table_info(branches)').all().map(c=>c.name);
  if(!columns.includes('moderation_status')){
    db.exec("ALTER TABLE branches ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'visible' CHECK(moderation_status IN ('visible','hidden'));");
  }
  const campaignColumns=db.prepare('PRAGMA table_info(campaigns)').all().map(c=>c.name);
  if(!campaignColumns.includes('origin')){
    db.exec("ALTER TABLE campaigns ADD COLUMN origin TEXT NOT NULL DEFAULT 'demo' CHECK(origin IN ('demo','community'));");
  }
  const addCampaign=db.prepare('INSERT OR IGNORE INTO campaigns (id,title,brand,category,short,audience,promise,evidence,visual,accent) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const addRoot=db.prepare('INSERT OR IGNORE INTO branches (id,campaign_id,parent_id,generation,changed_gene,hook,tone,cta,creator_session) VALUES (?,?,NULL,0,NULL,?,?,?,NULL)');
  for(const c of SEEDS){
    addCampaign.run(c.id,c.title,c.brand,c.category,c.short,c.audience,c.promise,c.evidence,c.visual,c.accent);
    addRoot.run(c.id+'-ROOT',c.id,c.hook,c.tone,c.cta);
  }
  require('./commercial-schema').migrateCommercial(db);
  require('./waves11-15-schema').migrateWaves1115(db);
  require('./waves16-20-schema').migrateWaves1620(db);
  return db;
}
function record(db,name,sessionId=null,branchId=null,source='server'){
  db.prepare('INSERT INTO events(name,source,session_id,branch_id) VALUES(?,?,?,?)').run(name,source,sessionId,branchId);
}
function getBranch(db,id){
  return db.prepare(`SELECT b.id,b.parent_id AS parentId,b.generation,b.changed_gene AS changedGene,
    b.hook,b.tone,b.cta,b.creator_session AS creatorSession,b.action_status AS actionStatus,
    b.moderation_status AS moderationStatus,b.created_at AS createdAt,
    c.id AS campaignId,c.title,c.brand,c.category,c.short,c.audience,c.promise,c.evidence,c.visual,c.accent,c.origin,
    COALESCE((SELECT status FROM campaign_controls WHERE campaign_id=c.id),'open') AS campaignStatus,
    (SELECT COUNT(*) FROM branches d WHERE d.parent_id=b.id AND d.moderation_status='visible') AS childrenCount
    FROM branches b JOIN campaigns c ON b.campaign_id=c.id WHERE b.id=?`).get(id);
}
function isVisible(db,id){
  const row=db.prepare(`WITH RECURSIVE parent_chain(id,parent_id,moderation_status,depth) AS (
    SELECT id,parent_id,moderation_status,0 FROM branches WHERE id=?
    UNION ALL
    SELECT b.id,b.parent_id,b.moderation_status,pc.depth+1 FROM branches b JOIN parent_chain pc ON b.id=pc.parent_id WHERE pc.depth<41
  ) SELECT COUNT(*) AS total,SUM(CASE WHEN moderation_status='hidden' THEN 1 ELSE 0 END) AS hidden FROM parent_chain`).get(id);
  return row.total>0 && !row.hidden;
}
function requireVisible(db,id){
  const b=getBranch(db,id);
  if(!b)throw new AppError('Ветвь не найдена.',404,'NOT_FOUND');
  if(!isVisible(db,id))throw new AppError('Ветвь временно недоступна после проверки публикации.',403,'MODERATED');
  return b;
}
function withTransaction(db,fn){
  db.exec('BEGIN IMMEDIATE');
  try{const result=fn();db.exec('COMMIT');return result;}
  catch(err){db.exec('ROLLBACK');throw err;}
}
function enforceSessionQuota(db,sessionId,eventName,limit,interval){
  const count=db.prepare('SELECT COUNT(*) AS n FROM events WHERE session_id=? AND name=? AND created_at >= datetime(?, ?)')
    .get(sessionId,eventName,'now',interval).n;
  if(count>=limit)throw new AppError('Временный лимит действий исчерпан. Попробуйте позже.',429,'ACTION_QUOTA');
}
function createChild(db,{parentId,gene,value,sessionId,inviteToken,cinemaNonce=null,cinemaHash=null}){
  if(!GENES.includes(gene))throw new AppError('Выберите доступный ген.');
  if(typeof value!=='string')throw new AppError('Значение должно быть текстом.');
  const v=value.trim().replace(/\s+/g,' ');
  if(gene==='tone'&&!TONES.includes(v))throw new AppError('Выберите тон из списка.');
  if(gene!=='tone'&&(v.length<7||v.length>110))throw new AppError('Текст должен содержать от 7 до 110 символов.');
  if(/[<>\u0000-\u001F]/.test(v))throw new AppError('Недопустимые символы в тексте.');
  require('./quality').mutationGuard(gene,v);
  return withTransaction(db,()=>{
    if(cinemaNonce){
      const prior=db.prepare("SELECT parent_id AS parentId,gene,value_hash AS valueHash,child_id AS childId FROM cinema_publications WHERE session_id=? AND nonce=?").get(sessionId,cinemaNonce);
      if(prior){
        if(prior.parentId!==parentId||prior.gene!==gene||prior.valueHash!==cinemaHash)throw new AppError("Идентификатор публикации использован для другого действия.",409,"CINEMA_NONCE_CONFLICT");
        return requireVisible(db,prior.childId);
      }
    }
    const parent=requireVisible(db,parentId);
    require('./campaign-control').assertOpen(db,parent.campaignId);
    enforceSessionQuota(db,sessionId,'mutation_completed',20,'-1 hour');
    if(parent.generation>=40)throw new AppError('Достигнут лимит поколений первой версии.',409,'LIMIT_REACHED');
    if(parent.creatorSession===sessionId)throw new AppError('Свою публичную ветвь продолжает другой человек.',409,'SELF_INHERITANCE');
    if(parent.changedGene===gene)throw new AppError('Нельзя менять тот же ген, который изменил предшественник.',409,'GENE_LOCKED');
    if(parent[gene]===v)throw new AppError('Мутация должна действительно менять текст.');
    let invite;
    if(inviteToken){
      invite=db.prepare('SELECT * FROM invites WHERE token=?').get(inviteToken);
      if(!invite||invite.branch_id!==parentId)throw new AppError('Приглашение не найдено.',404,'INVITE_INVALID');
      if(invite.child_id)throw new AppError('Это приглашение уже использовано.',409,'INVITE_USED');
      if(invite.creator_session===sessionId)throw new AppError('Своё приглашение передать себе нельзя.',409,'SELF_INVITE');
      if(Date.parse(invite.expires_at)<=Date.now())throw new AppError('Срок приглашения истёк.',410,'INVITE_EXPIRED');
    }
    const id=parent.campaignId+'-'+uid(9);
    const snapshot={hook:parent.hook,tone:parent.tone,cta:parent.cta,[gene]:v};
    db.prepare('INSERT INTO branches(id,campaign_id,parent_id,generation,changed_gene,hook,tone,cta,creator_session) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,parent.campaignId,parent.id,parent.generation+1,gene,snapshot.hook,snapshot.tone,snapshot.cta,sessionId);
    if(invite){
      const result=db.prepare('UPDATE invites SET used_by=?,child_id=? WHERE token=? AND child_id IS NULL').run(sessionId,id,inviteToken);
      if(!result.changes)throw new AppError('Приглашение уже использовано.',409,'INVITE_USED');
      record(db,'invite_completed',sessionId,id);
    }
    record(db,'mutation_completed',sessionId,id);
    if(cinemaNonce){
      db.prepare('INSERT INTO cinema_publications(session_id,nonce,parent_id,gene,value_hash,child_id) VALUES(?,?,?,?,?,?)').run(sessionId,cinemaNonce,parentId,gene,cinemaHash,id);
      record(db,'cinema_mutation_published',sessionId,id,'cinema');
    }
    return getBranch(db,id);
  });
}
function createInvite(db,branchId,sessionId){
  const b=requireVisible(db,branchId);
  if(b.creatorSession!==sessionId)throw new AppError('Приглашения создаёт автор ветви.',403,'NOT_OWNER');
  return withTransaction(db,()=>{
    require('./campaign-control').assertOpen(db,b.campaignId);
    enforceSessionQuota(db,sessionId,'invite_created',12,'-1 hour');
    const open=db.prepare('SELECT COUNT(*) AS n FROM invites WHERE branch_id=? AND child_id IS NULL AND expires_at>?').get(branchId,new Date().toISOString()).n;
    if(open>=3)throw new AppError('У ветви уже есть три активных приглашения. Сначала используйте их.',409,'INVITES_FULL');
    const token=uid(24),expiresAt=new Date(Date.now()+1000*60*60*24*30).toISOString();
    db.prepare('INSERT INTO invites(token,branch_id,creator_session,expires_at) VALUES(?,?,?,?)').run(token,branchId,sessionId,expiresAt);
    record(db,'invite_created',sessionId,branchId);
    return {token,expiresAt};
  });
}
function lineage(db,id){
  const branch=requireVisible(db,id),ancestors=[];
  let node=branch;
  while(node&&ancestors.length<42){ancestors.unshift(node);node=node.parentId?getBranch(db,node.parentId):null;}
  const candidates=db.prepare('SELECT id,changed_gene AS changedGene,generation,created_at AS createdAt FROM branches WHERE parent_id=? ORDER BY created_at ASC,id ASC LIMIT 50').all(id);
  const children=candidates.filter(c=>isVisible(db,c.id));
  const raw=db.prepare(`WITH RECURSIVE tree(id,depth) AS (
    SELECT id,0 FROM branches WHERE id=?
    UNION ALL SELECT b.id,t.depth+1 FROM branches b JOIN tree t ON b.parent_id=t.id WHERE t.depth<40 AND b.moderation_status='visible'
  ) SELECT COUNT(*)-1 AS count,MAX(depth) AS maxDepth FROM tree`).get(id);
  return {branch,ancestors,children,descendants:raw.count,maxDepth:raw.maxDepth};
}
function saveWorkspace(db,branchId,sessionId,data){
  const branch=requireVisible(db,branchId);
  if(branch.creatorSession!==sessionId)throw new AppError('Редактировать рабочую копию может только автор ветви.',403,'NOT_OWNER');
  const fields={headline:180,cta:180,tone:60,notes:1500};
  const clean={};
  for(const [name,max] of Object.entries(fields)){
    if(typeof data[name]!=='string')throw new AppError('Некорректное поле '+name);
    const val=data[name].trim();
    if(val.length>max||(name!=='notes'&&val.length<2)||/[\u0000-\u0008\u000B-\u001F]/.test(val))throw new AppError('Некорректная длина или символы поля '+name);
    clean[name]=val;
  }
  return withTransaction(db,()=>{
    enforceSessionQuota(db,sessionId,'workspace_saved',60,'-1 hour');
    db.prepare(`INSERT INTO workspaces(branch_id,owner_session,headline,cta,tone,notes)
      VALUES(?,?,?,?,?,?) ON CONFLICT(branch_id) DO UPDATE SET
      headline=excluded.headline,cta=excluded.cta,tone=excluded.tone,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`)
      .run(branchId,sessionId,clean.headline,clean.cta,clean.tone,clean.notes);
    record(db,'workspace_saved',sessionId,branchId);
    return db.prepare('SELECT headline,cta,tone,notes,updated_at AS updatedAt FROM workspaces WHERE branch_id=? AND owner_session=?').get(branchId,sessionId);
  });
}
function getWorkspace(db,branchId,sessionId){
  const b=requireVisible(db,branchId);
  if(b.creatorSession!==sessionId)throw new AppError('Рабочая копия другого человека недоступна.',403,'NOT_OWNER');
  const saved=db.prepare('SELECT headline,cta,tone,notes,updated_at AS updatedAt FROM workspaces WHERE branch_id=? AND owner_session=?').get(branchId,sessionId);
  return {branchId,headline:saved?.headline??b.hook,cta:saved?.cta??b.cta,tone:saved?.tone??b.tone,notes:saved?.notes??'',updatedAt:saved?.updatedAt??null};
}
function reportBranch(db,branchId,sessionId,reason,details){
  const b=requireVisible(db,branchId);
  if(!b.parentId)throw new AppError('Исходный демонстрационный материал не принимается на модерацию.',400);
  if(b.creatorSession===sessionId)throw new AppError('Нельзя отправить жалобу на собственную ветвь.',400,'SELF_REPORT');
  if(!REPORT_REASONS.includes(reason)||typeof details!=='string'||details.length>400)throw new AppError('Выберите причину жалобы и короткое описание.');
  return withTransaction(db,()=>{
    enforceSessionQuota(db,sessionId,'branch_reported',8,'-1 day');
    const inserted=db.prepare('INSERT OR IGNORE INTO branch_reports(branch_id,reporter_session,reason,details) VALUES(?,?,?,?)')
      .run(branchId,sessionId,reason,details.trim());
    if(inserted.changes)record(db,'branch_reported',sessionId,branchId);
    return {ok:true,duplicate:!inserted.changes};
  });
}
function moderationSet(db,branchId,status,reason){
  if(!['visible','hidden'].includes(status))throw new AppError('Неверный статус модерации.');
  const b=getBranch(db,branchId);
  if(!b||(!b.parentId&&b.origin!=='community'))throw new AppError('Нельзя изменить статус демо-образца или неизвестной ветви.');
  if(typeof reason!=='string'||reason.trim().length<4||reason.length>200)throw new AppError('Укажите причину изменения статуса.');
  return withTransaction(db,()=>{
    if(b.moderationStatus===status)return {changed:false,branchId,status};
    db.prepare('UPDATE branches SET moderation_status=? WHERE id=?').run(status,branchId);
    db.prepare('INSERT INTO moderation_log(branch_id,old_status,new_status,reason) VALUES(?,?,?,?)').run(branchId,b.moderationStatus,status,reason.trim());
    return {changed:true,branchId,status};
  });
}
function stats(db){
  const count=q=>db.prepare(q).get().n;
  return {
    liveBranches:count(`WITH RECURSIVE public_tree(id) AS (
      SELECT id FROM branches WHERE parent_id IS NULL AND moderation_status='visible'
      UNION ALL SELECT b.id FROM branches b JOIN public_tree p ON b.parent_id=p.id WHERE b.moderation_status='visible'
    ) SELECT COUNT(*) AS n FROM branches b JOIN public_tree p ON b.id=p.id WHERE b.parent_id IS NOT NULL`),
    contributors:count(`WITH RECURSIVE public_tree(id) AS (
      SELECT id FROM branches WHERE parent_id IS NULL AND moderation_status='visible'
      UNION ALL SELECT b.id FROM branches b JOIN public_tree p ON b.parent_id=p.id WHERE b.moderation_status='visible'
    ) SELECT COUNT(DISTINCT b.creator_session) AS n FROM branches b JOIN public_tree p ON b.id=p.id WHERE b.parent_id IS NOT NULL`),
    invitationsUsed:count('SELECT COUNT(*) AS n FROM invites WHERE child_id IS NOT NULL'),
    verifiedActions:count(`SELECT COUNT(*) AS n FROM (
      SELECT branch_id FROM platform_events
      UNION SELECT h.branch_id FROM partner_receipts r JOIN handoffs h ON h.id=r.handoff_id WHERE r.environment='live'
    )`),
    selfReportedActions:count("SELECT COUNT(*) AS n FROM branches WHERE action_status='reported'"),
    workspacesSaved:count('SELECT COUNT(*) AS n FROM workspaces'),
    approvedBrandCampaigns:count("SELECT COUNT(*) AS n FROM campaigns WHERE origin='community'"),
    publishedBrandCampaigns:count("SELECT COUNT(*) AS n FROM campaigns c JOIN branches b ON b.campaign_id=c.id WHERE c.origin='community' AND b.parent_id IS NULL AND b.moderation_status='visible'"),
    pendingBrandBriefs:count("SELECT COUNT(*) AS n FROM brand_submissions WHERE status='pending'"),
    note:'Подтверждения рекламных действий принимаются только от доверенной платформы через подписанный запрос. Самоотчёты учитываются отдельно.'
  };
}
module.exports={openDatabase,uid,getBranch,requireVisible,isVisible,record,withTransaction,enforceSessionQuota,AppError,createChild,createInvite,lineage,stats,saveWorkspace,getWorkspace,reportBranch,moderationSet,SEEDS,GENES,TONES,REPORT_REASONS};
