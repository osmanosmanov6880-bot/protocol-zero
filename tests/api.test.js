'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'protocol-zero-test-'));
process.env.DB_PATH=path.join(temp,'test.sqlite');
process.env.PLATFORM_WEBHOOK_SECRET='integration-test-secret-not-for-production';
const {server}=require('../src/server');
let base;
function client(){
  let cookie='';
  return async function call(p,method='GET',data,extraHeaders={}){
    const headers={...extraHeaders};
    if(cookie)headers.cookie=cookie;
    if(data!==undefined)headers['Content-Type']='application/json';
    const response=await fetch(base+p,{method,headers,body:data!==undefined?JSON.stringify(data):undefined});
    const c=response.headers.get('set-cookie');if(c)cookie=c.split(';')[0];
    const json=await response.json();return {status:response.status,json,cookie};
  };
}
before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});});

test('Health and seeded campaigns contain zero fictional user activity',async()=>{
  const alice=client();const health=await alice('/api/health');assert.equal(health.status,200);assert.equal(health.json.ok,true);
  const initial=await alice('/api/bootstrap');assert.equal(initial.json.roots.length,3);assert.equal(initial.json.stats.liveBranches,0);assert.equal(initial.json.stats.contributors,0);assert.equal(initial.json.config.platformEnabled,false);
});

test('Two anonymous users create real lineage via single-use invitation and locked gene',async()=>{
  const alice=client();const bob=client();const charlie=client();
  const starting=(await alice('/api/bootstrap')).json.roots[0];
  const child=await alice('/api/mutations','POST',{parentId:starting.id,gene:'hook',value:'Не оставляйте яркие идеи в хаосе.'});
  assert.equal(child.status,201);assert.equal(child.json.generation,1);assert.equal(child.json.parentId,starting.id);assert.equal(child.json.hook,'Не оставляйте яркие идеи в хаосе.');assert.equal(child.json.tone,starting.tone);
  assert.equal((await alice('/api/branches/'+starting.id)).json.hook,starting.hook,'parent remains immutable');
  const self=await alice('/api/mutations','POST',{parentId:child.json.id,gene:'cta',value:'Открыть рабочий план'});assert.equal(self.status,409);assert.equal(self.json.code,'SELF_INHERITANCE');
  const invite=await alice('/api/branches/'+child.json.id+'/invites','POST',{});assert.equal(invite.status,201);assert.match(invite.json.token,/^[\w-]{32}$/);
  const ownInvite=await alice('/api/invites/'+invite.json.token);assert.equal(ownInvite.json.status,'own');
  const accept=await bob('/api/invites/'+invite.json.token);assert.equal(accept.json.status,'open');
  const block=await bob('/api/mutations','POST',{parentId:child.json.id,gene:'hook',value:'Другой заголовок без изменения смысла',inviteToken:invite.json.token});assert.equal(block.status,409);assert.equal(block.json.code,'GENE_LOCKED');
  const second=await bob('/api/mutations','POST',{parentId:child.json.id,gene:'cta',value:'Собрать задачи в одном месте',inviteToken:invite.json.token});
  assert.equal(second.status,201);assert.equal(second.json.generation,2);assert.equal(second.json.changedGene,'cta');
  const invalidRetry=await charlie('/api/mutations','POST',{parentId:child.json.id,gene:'tone',value:'Ироничный',inviteToken:invite.json.token});assert.equal(invalidRetry.status,409);assert.equal(invalidRetry.json.code,'INVITE_USED');
  const history=await alice('/api/branches/'+child.json.id+'/lineage');assert.equal(history.status,200);assert.equal(history.json.ancestors.length,2);assert.equal(history.json.descendants,1);assert.equal(history.json.children[0].id,second.json.id);
  const invited=await alice('/api/invites/'+invite.json.token);assert.equal(invited.json.status,'used');assert.equal(invited.json.childId,second.json.id);
  const stats=(await alice('/api/stats')).json;assert.equal(stats.liveBranches,2);assert.equal(stats.invitationsUsed,1);assert.equal(stats.contributors,2);assert.equal(stats.verifiedActions,0);
  // Browser-reported action cannot become a verified action.
  const report=await alice('/api/branches/'+child.json.id+'/action/report','POST',{});assert.equal(report.status,200);assert.equal(report.json.actionStatus,'reported');
  assert.equal((await alice('/api/stats')).json.verifiedActions,0);
  // Signed provider webhook is the only path to verified action.
  const body={event_id:'test-event-000001',branch_id:child.json.id,action_type:'artifact_created'};
  const raw=JSON.stringify(body);const signed='sha256='+crypto.createHmac('sha256',process.env.PLATFORM_WEBHOOK_SECRET).update(raw).digest('hex');
  const unsigned=await bob('/api/integrations/verified','POST',body);assert.equal(unsigned.status,401);
  const confirmed=await bob('/api/integrations/verified','POST',body,{'X-PZ-Signature':signed});assert.equal(confirmed.status,200);assert.equal(confirmed.json.duplicate,false);
  const duplicate=await bob('/api/integrations/verified','POST',body,{'X-PZ-Signature':signed});assert.equal(duplicate.json.duplicate,true);
  assert.equal((await alice('/api/stats')).json.verifiedActions,1);
  // Consent deletion must not resurrect a previously consumed invite.
  const recipientDeletion=await bob('/api/privacy/delete','POST',{});
  assert.equal(recipientDeletion.status,200);
  const alreadyConsumed=await charlie('/api/invites/'+invite.json.token);
  assert.equal(alreadyConsumed.json.status,'used');
  const resurrectAttempt=await charlie('/api/mutations','POST',{parentId:child.json.id,gene:'tone',value:'Ироничный',inviteToken:invite.json.token});
  assert.equal(resurrectAttempt.status,409);
  assert.equal(resurrectAttempt.json.code,'INVITE_USED');
});

test('Server validates mutation payloads and refuses cross-origin requests',async()=>{
 const user=client();const root=(await user('/api/bootstrap')).json.roots[1];
 const bad=await user('/api/mutations','POST',{parentId:root.id,gene:'promise',value:'Нереальное обещание'});assert.equal(bad.status,400);
 const badTone=await user('/api/mutations','POST',{parentId:root.id,gene:'tone',value:'Гарантированная доходность'});assert.equal(badTone.status,400);
 const injection=await user('/api/mutations','POST',{parentId:root.id,gene:'hook',value:'<script>alert(1)</script>'});assert.equal(injection.status,400);
 const cross=await user('/api/mutations','POST',{parentId:root.id,gene:'tone',value:'Ироничный'},{Origin:'https://evil.example'});assert.equal(cross.status,403);
});

test('An anonymous user can delete their browser identity without erasing public genealogy',async()=>{
 const user=client();const root=(await user('/api/bootstrap')).json.roots[2];const branch=await user('/api/mutations','POST',{parentId:root.id,gene:'tone',value:'Тёплый'});assert.equal(branch.status,201);
 const removed=await user('/api/privacy/delete','POST',{});assert.equal(removed.status,200);
 const visible=await user('/api/branches/'+branch.json.id);assert.equal(visible.status,200);assert.equal(visible.json.isMine,false);
 const owned=(await user('/api/bootstrap')).json.mine;assert.equal(owned.length,0);
});

test('Static assets and SPA routes load',async()=>{
 const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/PROTOCOL ZERO/);
 const js=await fetch(base+'/app.js');assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);
 const deep=await fetch(base+'/b/7F-001-ROOT');assert.equal(deep.status,200);
 const unfound=await fetch(base+'/admin');assert.equal(unfound.status,404);
});
