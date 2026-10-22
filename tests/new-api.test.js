'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-next-tests-'));
process.env.DB_PATH=path.join(dir,'suite.sqlite');
process.env.PLATFORM_WEBHOOK_SECRET='very-long-integration-test-key-0001';
const {server,db}=require('../src/server');
const {moderationSet,openDatabase}=require('../src/database');
let rootUrl;
function client(){
  let cookie='';
  return async function call(route,method='GET',payload,extra={}){
    const headers={...extra};
    if(cookie)headers.cookie=cookie;
    if(payload!==undefined)headers['Content-Type']='application/json';
    const response=await fetch(rootUrl+route,{method,headers,body:payload!==undefined?JSON.stringify(payload):undefined});
    const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
    const type=response.headers.get('content-type')||'';
    const body=type.includes('json')?await response.json():await response.text();
    return {status:response.status,body,headers:response.headers,cookie};
  };
}
before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));rootUrl='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});});

test('Private workspace can be edited only by author, and is not a public mutation',async()=>{
  const alice=client(),bob=client();
  const root=(await alice('/api/bootstrap')).body.roots[0];
  const branch=(await alice('/api/mutations','POST',{parentId:root.id,gene:'hook',value:'Это новая правдивая формулировка заголовка'})).body;
  const created=await alice('/api/branches/'+branch.id+'/workspace');
  assert.equal(created.status,200);assert.equal(created.body.headline,branch.hook);
  const foreign=await bob('/api/branches/'+branch.id+'/workspace');assert.equal(foreign.status,403);
  const update=await alice('/api/branches/'+branch.id+'/workspace','PUT',{headline:'Переработанный заголовок вне публичной ветви',tone:'Авторский дружелюбный',cta:'Задать вопрос о продукте',notes:'Нужно обсудить с командой целевую аудиторию.'});
  assert.equal(update.status,200);assert.ok(update.body.updatedAt);
  const publicBranch=(await bob('/api/branches/'+branch.id)).body;
  assert.equal(publicBranch.hook,branch.hook,'public mutation must stay unchanged');
  const saved=(await alice('/api/branches/'+branch.id+'/workspace')).body;
  assert.equal(saved.headline,'Переработанный заголовок вне публичной ветви');
  const bad=await alice('/api/branches/'+branch.id+'/workspace','PUT',{headline:'',tone:'T',cta:'',notes:'x'});
  assert.equal(bad.status,400);
  const exportData=(await alice('/api/privacy/export')).body;
  assert.ok(exportData.branches.find(b=>b.id===branch.id));
  assert.equal(exportData.workspaces[0].notes,'Нужно обсудить с командой целевую аудиторию.');
  assert.ok(Array.isArray(exportData.sentInvites));
  const removed=await alice('/api/privacy/delete','POST',{});assert.equal(removed.status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workspaces WHERE branch_id=?').get(branch.id).n,0);
  assert.equal((await bob('/api/branches/'+branch.id)).status,200,'public story should remain');
});

test('User reports are private; operator hiding a branch blocks its descendants and social cards',async()=>{
  const alice=client(),bob=client(),charlie=client();
  const root=(await alice('/api/bootstrap')).body.roots[1];
  const b=(await alice('/api/mutations','POST',{parentId:root.id,gene:'hook',value:'Жаркий хлеб ждёт вас за углом'})).body;
  const child=(await bob('/api/mutations','POST',{parentId:b.id,gene:'tone',value:'Ироничный'})).body;
  assert.equal(child.status,undefined);
  const reported=await charlie('/api/branches/'+b.id+'/report','POST',{reason:'misleading',details:'Проверить факт публикации.'});
  assert.equal(reported.status,201);assert.equal(reported.body.duplicate,false);
  assert.equal((await charlie('/api/branches/'+b.id+'/report','POST',{reason:'spam',details:''})).body.duplicate,true);
  const invalid=await charlie('/api/branches/'+b.id+'/report','POST',{reason:'hack',details:''});
  assert.equal(invalid.status,400);
  assert.equal((await alice('/api/branches/'+b.id)).body.reports,undefined,'report details must not leak');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM branch_reports WHERE branch_id=?').get(b.id).n,1);
  const changed=moderationSet(db,b.id,'hidden','Подтверждённая жалоба при тестировании');assert.equal(changed.changed,true);
  assert.equal((await bob('/api/branches/'+b.id)).status,403);
  assert.equal((await bob('/api/branches/'+child.id)).status,403);
  assert.equal((await bob('/cards/'+b.id+'.svg')).status,403);
  assert.equal((await charlie('/b/'+b.id)).status,403);
  assert.equal((await charlie('/api/branches/'+b.id+'/lineage')).status,403);
  assert.equal((await charlie('/api/mutations','POST',{parentId:b.id,gene:'cta',value:'Открыть каталог этой пекарни'})).status,403);
  const recent=(await charlie('/api/bootstrap')).body.recent;
  assert.equal(recent.some(x=>x.id===b.id||x.id===child.id),false);
  moderationSet(db,b.id,'visible','Жалоба проверена, материал восстановлен');
  assert.equal((await charlie('/api/branches/'+child.id)).status,200);
});

test('Invitation generation has per-branch limits; social cards escape user-submitted text',async()=>{
  const alice=client();const root=(await alice('/api/bootstrap')).body.roots[2];
  const b=(await alice('/api/mutations','POST',{parentId:root.id,gene:'hook',value:'Яркий выбор: расскажем о творческих идеях'})).body;
  for(let i=0;i<3;i++){const inv=await alice('/api/branches/'+b.id+'/invites','POST',{});assert.equal(inv.status,201);}
  const limited=await alice('/api/branches/'+b.id+'/invites','POST',{});assert.equal(limited.status,409);assert.equal(limited.body.code,'INVITES_FULL');
  const card=await alice('/cards/'+b.id+'.svg');assert.equal(card.status,200);assert.match(card.headers.get('content-type'),/image\/svg\+xml/);
  assert.match(card.body,/ПРОТОКОЛ|НАCЛЕД|НАСЛЕДНИКИ/);assert.match(card.body,/Яркий выбор/);
  const og=await alice('/b/'+b.id);assert.equal(og.status,200);assert.match(og.body,/og:image/);assert.match(og.body,/\/og-default\.png/);
});

test('Webhook replay reuses ID only for the identical branch and action',async()=>{
  const alice=client();const root=(await alice('/api/bootstrap')).body.roots[0];
  const a=(await alice('/api/mutations','POST',{parentId:root.id,gene:'cta',value:'Получить демонстрационный доступ'})).body;
  const other=(await alice('/api/mutations','POST',{parentId:root.id,gene:'hook',value:'Реальные идеи требуют внимания'})).body;
  async function send(body){const raw=JSON.stringify(body),signature='sha256='+crypto.createHmac('sha256',process.env.PLATFORM_WEBHOOK_SECRET).update(raw).digest('hex');return alice('/api/integrations/verified','POST',body,{'X-PZ-Signature':signature});}
  const first={event_id:'platform-2026-00000999',branch_id:a.id,action_type:'artifact_created'};
  assert.equal((await send(first)).body.duplicate,false);
  assert.equal((await send(first)).body.duplicate,true);
  const conflict=await send({...first,branch_id:other.id});assert.equal(conflict.status,409);assert.equal(conflict.body.code,'EVENT_CONFLICT');
  assert.equal((await alice('/api/branches/'+other.id)).body.actionStatus,'none');
});

test('Database migration adds columns to genuine v1.0-shaped table without losing branches',()=>{
  const filename=path.join(dir,'legacy.sqlite'),legacy=new DatabaseSync(filename);
  legacy.exec(`
    CREATE TABLE sessions(id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE campaigns(
      id TEXT PRIMARY KEY, title TEXT NOT NULL, brand TEXT NOT NULL, category TEXT NOT NULL,
      short TEXT NOT NULL, audience TEXT NOT NULL, promise TEXT NOT NULL,
      evidence TEXT NOT NULL, visual TEXT NOT NULL, accent TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE branches(
      id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      parent_id TEXT REFERENCES branches(id),generation INTEGER NOT NULL,
      changed_gene TEXT,hook TEXT NOT NULL,tone TEXT NOT NULL,cta TEXT NOT NULL,
      creator_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      action_status TEXT NOT NULL DEFAULT 'none',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(changed_gene IS NULL OR changed_gene IN ('hook','tone','cta')),
      CHECK(action_status IN ('none','reported','verified'))
    );
    INSERT INTO sessions(id) VALUES('legacy-person');
    INSERT INTO campaigns(id,title,brand,category,short,audience,promise,evidence,visual,accent)
      VALUES('legacy','Old','Brand','Category','Short','Audience','Promise','Evidence','Visual','#fff');
    INSERT INTO branches(id,campaign_id,parent_id,generation,changed_gene,hook,tone,cta,creator_session)
      VALUES('legacy-root','legacy',NULL,0,NULL,'Original heading','Спокойный','Original CTA',NULL);
    INSERT INTO branches(id,campaign_id,parent_id,generation,changed_gene,hook,tone,cta,creator_session)
      VALUES('legacy-child','legacy','legacy-root',1,'hook','Real user text','Спокойный','Original CTA','legacy-person');
  `);
  legacy.close();
  const migrated=openDatabase(filename);
  const stored=migrated.prepare('SELECT id,hook,creator_session,moderation_status FROM branches WHERE id=?').get('legacy-child');
  assert.deepEqual({...stored},{id:'legacy-child',hook:'Real user text',creator_session:'legacy-person',moderation_status:'visible'});
  assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM workspaces').get().n,0);
  migrated.close();
});
