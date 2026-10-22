'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-bridge-'));
const sandboxSecret=crypto.randomBytes(48).toString('hex');
const liveSecret=crypto.randomBytes(48).toString('hex');
process.env.DB_PATH=path.join(dir,'main.sqlite');
process.env.PZ_SANDBOX_DB_PATH=path.join(dir,'demo.sqlite');
process.env.PZ_DEMO_PARTNER_SECRET=sandboxSecret;
process.env.PZ_LIVE_TEST_SECRET=liveSecret;
const platformFile=path.join(dir,'platforms.json');
fs.writeFileSync(platformFile,JSON.stringify([
  {key:'demo_lab',name:'Демо-макеты, отдельный сервер',url:'http://127.0.0.1:8790/',mode:'sandbox',secretEnv:'PZ_DEMO_PARTNER_SECRET',capabilities:['sandbox']},
  {key:'real_test',name:'Лаборатория live-интеграции, тест',url:'https://partner.example/editor',mode:'live',secretEnv:'PZ_LIVE_TEST_SECRET',capabilities:['text']}
]));
process.env.PZ_PLATFORMS_FILE=platformFile;
const {server,db}=require('../src/server');
const {moderationSet}=require('../src/database');
const {funnel}=require('../src/analytics');
let root,partnerRoot,partnerServer,partnerDb;
function makeClient(){
  let cookie='';
  return async(route,method='GET',payload,options={})=>{
    const headers={...(options.headers||{})};
    if(cookie)headers.Cookie=cookie;
    if(payload!==undefined)headers['Content-Type']='application/json';
    const res=await fetch(root+route,{method,headers,body:payload!==undefined?JSON.stringify(payload):undefined,redirect:'manual'});
    const set=res.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
    const type=res.headers.get('content-type')||'';
    const body=type.includes('json')?await res.json():await res.text();
    return {status:res.status,body,headers:res.headers,cookie};
  };
}
function signed(key,secret,payload,{timestamp=Math.floor(Date.now()/1000),signatureOverride}={}){
  const raw=JSON.stringify(payload),ts=String(timestamp),mac='sha256='+crypto.createHmac('sha256',secret).update(ts+'.'+raw).digest('hex');
  return fetch(root+'/api/integrations/v2/'+key,{method:'POST',headers:{'Content-Type':'application/json','X-PZ-Platform':secret===sandboxSecret?'demo_lab':'real_test','X-PZ-Timestamp':ts,'X-PZ-Signature':signatureOverride||mac},body:raw})
    .then(async r=>({status:r.status,body:await r.json()}));
}
before(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  root='http://127.0.0.1:'+server.address().port;
  process.env.PZ_BRIDGE_URL=root;
  const demo=require('../examples/partner-sandbox');
  partnerServer=demo.server;partnerDb=demo.db;
  await new Promise(resolve=>partnerServer.listen(0,'127.0.0.1',resolve));
  partnerRoot='http://127.0.0.1:'+partnerServer.address().port;
});
after(async()=>{
  await new Promise(resolve=>partnerServer.close(resolve));
  await new Promise(resolve=>server.close(resolve));
  db.close();partnerDb.close();fs.rmSync(dir,{recursive:true,force:true});
});

test('Adapter registry never exposes HMAC secrets or arbitrary unconfigured claims',async()=>{
  const alice=makeClient(),r=await alice('/api/bootstrap');
  assert.equal(r.status,200);assert.equal(r.body.config.version,'3.4.0');
  assert.equal(r.body.platforms.length,2);assert.equal(r.body.platforms[0].mode,'sandbox');
  assert.ok(r.body.platforms[0].callbackConfigured);
  assert.equal(JSON.stringify(r.body).includes(sandboxSecret),false);
  const health=await alice('/api/health');assert.equal(health.body.version,'3.4.0');
  const docs=await alice('/api/platforms');assert.equal(docs.body.platforms.length,2);
  assert.equal((await alice('/bridge')).status,200,'refreshing bridge page must render SPA HTML');
});

test('Workspace handoff requires owner and explicit source, cannot be resolved before opening',async()=>{
  const alice=makeClient(),bob=makeClient();
  const seed=(await alice('/api/bootstrap')).body.roots[0];
  const rootDenied=await alice('/api/handoffs','POST',{branchId:seed.id,platformKey:'demo_lab',source:'public'});
  assert.equal(rootDenied.status,409);
  const branch=(await alice('/api/mutations','POST',{parentId:seed.id,gene:'hook',value:'Создавайте меньше ненужных совещаний в команде'})).body;
  const secretNote='МОЯ ЛИЧНАЯ РАБОЧАЯ ЗАМЕТКА';
  await alice('/api/branches/'+branch.id+'/workspace','PUT',{headline:'Сначала проблема, потом результат',tone:'Сдержанный и ясный',cta:'Откройте пример рабочей доски',notes:secretNote});
  const privateDenied=await bob('/api/branches/'+branch.id+'/brief?source=workspace');assert.equal(privateDenied.status,403);
  const takeover=await bob('/api/handoffs','POST',{branchId:branch.id,platformKey:'demo_lab',source:'workspace'});assert.equal(takeover.status,403);
  const bogus=await alice('/api/handoffs','POST',{branchId:branch.id,platformKey:'outside',source:'workspace'});assert.equal(bogus.status,404);
  const noSource=await alice('/api/handoffs','POST',{branchId:branch.id,platformKey:'demo_lab',source:'oops'});assert.equal(noSource.status,400);
  const tr=await alice('/api/handoffs','POST',{branchId:branch.id,platformKey:'demo_lab',source:'workspace'});
  assert.equal(tr.status,201);assert.match(tr.body.id,/^[\w-]{32}$/);assert.equal(tr.body.platform.mode,'sandbox');
  const id=tr.body.id;
  const secretAccess=await bob('/api/handoffs/'+id);assert.equal(secretAccess.status,403);
  const secretGet=await alice('/api/handoffs/'+id);assert.equal(secretGet.status,200);assert.equal(secretGet.body.brief.editorNotes,secretNote);
  const unavailable=await signed('resolve',sandboxSecret,{handoff_id:id});assert.equal(unavailable.status,409);assert.equal(unavailable.body.code,'HANDOFF_NOT_OPENED');
  const redirectNotOwner=await bob('/out/'+id);assert.equal(redirectNotOwner.status,403);
  const redirected=await alice('/out/'+id);assert.equal(redirected.status,302);
  assert.equal(new URL(redirected.headers.get('location')).searchParams.get('pz_handoff'),id);
  assert.equal(redirected.headers.get('referrer-policy'),'no-referrer');
  const invalidSignature=await signed('resolve',sandboxSecret,{handoff_id:id},{signatureOverride:'sha256='+'0'.repeat(64)});
  assert.equal(invalidSignature.status,401);
  const stale=await signed('resolve',sandboxSecret,{handoff_id:id},{timestamp:Math.floor(Date.now()/1000)-999});assert.equal(stale.status,401);
  const otherPartner=await signed('resolve',liveSecret,{handoff_id:id});assert.equal(otherPartner.status,403);
  const resolved=await signed('resolve',sandboxSecret,{handoff_id:id});assert.equal(resolved.status,200);
  assert.equal(resolved.body.brief.editorNotes,secretNote);
  assert.equal(resolved.body.brief.creative.headline,'Сначала проблема, потом результат');
  assert.equal(JSON.stringify(resolved.body).includes(branch.creatorSession||'this-is-nonexistent'),false);
  const noPartner=await signed('confirm',sandboxSecret,{event_id:'invalid-event-00001',handoff_id:id,action_type:'sale',partner_object_id:'demo-123456'});
  assert.equal(noPartner.status,400);
  const receipt={event_id:'sandbox-artifact-0001',handoff_id:id,action_type:'artifact_created',partner_object_id:'sandbox-object-1'};
  assert.equal((await signed('confirm',sandboxSecret,receipt)).body.duplicate,false);
  assert.equal((await signed('confirm',sandboxSecret,receipt)).body.duplicate,true);
  assert.equal((await signed('confirm',sandboxSecret,{...receipt,partner_object_id:'sandbox-object-2'})).status,409);
  const branchAfter=await alice('/api/branches/'+branch.id);assert.equal(branchAfter.body.actionStatus,'none','sandbox must not confirm live activity');
  const current=(await alice('/api/stats')).body;assert.ok(current.sandboxActions>=1);assert.equal(current.partnerLiveActions,0);
  const list=await alice('/api/handoffs');assert.equal(list.body.handoffs.some(h=>h.id===id&&h.confirmedEvents===1),true);
  const revoke=await alice('/api/handoffs/'+id+'/revoke','POST',{});assert.equal(revoke.status,200);
  assert.equal((await signed('resolve',sandboxSecret,{handoff_id:id})).status,410);
  assert.equal((await alice('/out/'+id)).status,410);
});

test('An end-to-end sandbox HTTP partner saves to its own SQLite and confirms without live conversion',async()=>{
  const alice=makeClient(),seed=(await alice('/api/bootstrap')).body.roots[1];
  const branch=(await alice('/api/mutations','POST',{parentId:seed.id,gene:'cta',value:'Изучить свежие изделия на витрине'})).body;
  const handoff=(await alice('/api/handoffs','POST',{branchId:branch.id,platformKey:'demo_lab',source:'public'})).body;
  const id=handoff.id;
  assert.equal((await alice('/out/'+id)).status,302);
  const page=await fetch(partnerRoot+'/?pz_handoff='+id);assert.equal(page.status,200);const html=await page.text();
  assert.match(html,/Сохранить демонстрационный рекламный макет/);
  assert.match(html,/Изучить свежие изделия/);
  const form=await fetch(partnerRoot+'/create',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({handoff:id}),redirect:'manual'});
  assert.equal(form.status,303);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_receipts WHERE handoff_id=?').get(id).n,1);
  assert.equal(partnerDb.prepare('SELECT COUNT(*) AS n FROM demo_artifacts WHERE handoff_id=? AND verified_at IS NOT NULL').get(id).n,1);
  assert.equal((await alice('/api/branches/'+branch.id)).body.actionStatus,'none');
  assert.match(await(await fetch(partnerRoot+'/?pz_handoff='+id)).text(),/Демо-макет записан/);
  const replay=await fetch(partnerRoot+'/retry',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({handoff:id}),redirect:'manual'});
  assert.equal(replay.status,303);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_receipts WHERE handoff_id=?').get(id).n,1);
  const receipt=await alice('/api/handoffs/'+id);assert.equal(receipt.body.source,'public');assert.equal(receipt.body.brief.editorNotes,undefined);
});

test('Live partner requires a resolved handoff and signed, idempotent proof',async()=>{
  const alice=makeClient(),seed=(await alice('/api/bootstrap')).body.roots[2];
  const branch=(await alice('/api/mutations','POST',{parentId:seed.id,gene:'tone',value:'Дерзкий'})).body;
  const tr=(await alice('/api/handoffs','POST',{branchId:branch.id,platformKey:'real_test',source:'public'})).body;
  const payload={event_id:'live-event-2026-0000001',handoff_id:tr.id,action_type:'campaign_saved',partner_object_id:'campaign-real-test-123'};
  assert.equal((await signed('confirm',liveSecret,payload)).status,409);
  assert.equal((await alice('/out/'+tr.id)).status,302);
  const body=(await signed('resolve',liveSecret,{handoff_id:tr.id})).body;
  assert.equal(body.mode,'live');assert.equal(body.brief.editorNotes,undefined);
  assert.equal((await signed('confirm',liveSecret,payload)).status,200);
  assert.equal((await signed('confirm',liveSecret,payload)).body.duplicate,true);
  assert.equal((await alice('/api/branches/'+branch.id)).body.actionStatus,'verified');
  const st=(await alice('/api/stats')).body;assert.ok(st.verifiedActions>=1);assert.equal(st.partnerLiveActions,1);
  const funnelRows=funnel(db).rows;assert.ok(funnelRows.find(x=>x.stage==='Live-макет подтверждён').count>=1);
  const fromOther=await signed('confirm',sandboxSecret,{...payload,event_id:'new-event-different-platform'});assert.equal(fromOther.status,403);
});

test('Moderation and privacy deletion block old handoffs without exposing workspace content',async()=>{
  const alice=makeClient(),bob=makeClient(),seed=(await alice('/api/bootstrap')).body.roots[1];
  const branch=(await alice('/api/mutations','POST',{parentId:seed.id,gene:'hook',value:'Пройдите по знакомому маршруту утром'})).body;
  const tr=(await alice('/api/handoffs','POST',{branchId:branch.id,platformKey:'demo_lab',source:'public'})).body;
  await alice('/out/'+tr.id);
  moderationSet(db,branch.id,'hidden','Скрытие материала для теста');
  assert.equal((await signed('resolve',sandboxSecret,{handoff_id:tr.id})).status,403);
  moderationSet(db,branch.id,'visible','Восстановление после проверки');
  assert.equal((await signed('resolve',sandboxSecret,{handoff_id:tr.id})).status,200);
  const del=await alice('/api/privacy/delete','POST',{});assert.equal(del.status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM handoffs WHERE id=?').get(tr.id).n,0);
  assert.equal((await signed('resolve',sandboxSecret,{handoff_id:tr.id})).status,404);
  assert.equal((await bob('/api/branches/'+branch.id)).status,200,'anonymized public history survives');
  const ownList=await alice('/api/handoffs');assert.equal(ownList.body.handoffs.some(h=>h.id===tr.id),false);
});
