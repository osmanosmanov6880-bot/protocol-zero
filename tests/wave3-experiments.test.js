'use strict';
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const fs=require('node:fs');const os=require('node:os');const crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-wave3-'));
const secret=crypto.randomBytes(48).toString('hex'),sandboxSecret=crypto.randomBytes(48).toString('hex');
process.env.DB_PATH=path.join(dir,'test.sqlite');
process.env.PZ_W3_SECRET=secret;process.env.PZ_W3_SANDBOX=sandboxSecret;
process.env.PZ_PLATFORMS_FILE=path.join(dir,'platforms.json');
fs.writeFileSync(process.env.PZ_PLATFORMS_FILE,JSON.stringify([
  {key:'real_wave3',name:'Verified test-configured partner',url:'https://partner.example/',mode:'live',secretEnv:'PZ_W3_SECRET',capabilities:['text']},
  {key:'sandbox_wave3',name:'Internal demonstration only',url:'http://127.0.0.1:8790/',mode:'sandbox',secretEnv:'PZ_W3_SANDBOX',capabilities:['sandbox']}
]));
const {server,db}=require('../src/server');
const {reviewSubmission}=require('../src/submissions');
const {createNodePartner}=require('../sdk/node-partner');
let origin,owner,user,stranger,planId,variantId,submissionId,partner,rootId;
function client(){let cookie='';return async(url,method='GET',data)=>{const headers={};if(cookie)headers.cookie=cookie;if(data!==undefined)headers['content-type']='application/json';const r=await fetch(origin+url,{method,headers,redirect:'manual',body:data!==undefined?JSON.stringify(data):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,body:await r.json()};};}
const draft={brand:'EXPERIMENTAL BRAND',title:'Рекламная коммуникация студии',category:'Дизайн и услуги',short:'Студия графического дизайна рассказывает о своих услугах и портфолио.',audience:'Компании с потребностью в дизайне упаковки и фирменном стиле',promise:'Представить портфолио студии заинтересованной аудитории',evidence:'Заявленные характеристики и права проверяются оператором.',visual:'Настоящие работы, контрастная типографика',hook:'Хороший дизайн задаёт точные вопросы',tone:'Деловой',cta:'Посмотреть примеры работ студии',website:'',contactEmail:'',contactConsent:false,rightsConfirmed:true,publicConfirmed:true};
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;owner=client();user=client();stranger=client();await owner('/api/bootstrap');await user('/api/bootstrap');await stranger('/api/bootstrap');partner=createNodePartner({portalUrl:origin,platformKey:'real_wave3',secret,allowLocalHttp:true});});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('WAVE 3: author creates an immutable two-arm plan; unrelated session cannot read kit',async()=>{
  submissionId=(await owner('/api/business-briefs','POST',draft)).body.id;
  rootId=reviewSubmission(db,submissionId,'approved','Ручная проверка, открытая возможность публичного тестирования').rootId;
  variantId=(await user('/api/mutations','POST',{parentId:rootId,gene:'hook',value:'Вашему бренду нужен узнаваемый голос'})).body.id;
  const response=await owner('/api/business-briefs/'+submissionId+'/experiments','POST',{
    controlBranchId:rootId,treatmentBranchId:variantId,metric:'lead',hypothesis:'Новая фраза может лучше объяснять ценность портфолио.',platformKey:'real_wave3'
  });
  assert.equal(response.status,201);assert.equal(response.body.status,'ready');planId=response.body.id;
  const kit=await owner('/api/experiments/'+planId+'/kit');assert.equal(kit.status,200);
  assert.equal(kit.body.creative.A.headline,draft.hook);
  assert.equal(kit.body.creative.B.headline,'Вашему бренду нужен узнаваемый голос');
  assert.equal(kit.body.arms.A.impressions,0);assert.equal(kit.body.arms.B.goals,0);
  assert.equal((await stranger('/api/experiments/'+planId+'/kit')).status,403);
  const sandbox=await owner('/api/business-briefs/'+submissionId+'/experiments','POST',{
    controlBranchId:rootId,treatmentBranchId:variantId,metric:'lead',hypothesis:'Проверить формулировку на ограниченной аудитории.',platformKey:'sandbox_wave3'});
  assert.equal(sandbox.status,409);
});
test('WAVE 3: live partner assigns consistently, rejects goal-before-impression and dedupes valid signed events',async()=>{
  const visitorKey='visitor_very_random_000001';
  const assigned=await partner.assignExperiment({experimentId:planId,visitorKey});
  const again=await partner.assignExperiment({experimentId:planId,visitorKey});
  assert.equal(assigned.arm,again.arm);assert.equal(assigned.note.includes('показ ещё не подтверждён'),true);
  await assert.rejects(partner.recordExperiment({experimentId:planId,visitorKey,kind:'goal',eventId:'goal-wave3-0001'}),e=>e.status===409);
  const first=await partner.recordExperiment({experimentId:planId,visitorKey,kind:'impression',eventId:'view-wave3-0001'});
  assert.equal(first.ok,true);assert.equal(first.duplicate,false);
  const replay=await partner.recordExperiment({experimentId:planId,visitorKey,kind:'impression',eventId:'view-wave3-0001'});
  assert.equal(replay.duplicate,true);
  const goal=await partner.recordExperiment({experimentId:planId,visitorKey,kind:'goal',eventId:'goal-wave3-0001'});
  assert.equal(goal.ok,true);
  await assert.rejects(partner.recordExperiment({experimentId:planId,visitorKey,kind:'goal',eventId:'goal-wave3-0002'}),e=>e.status===409);
  const count=(await owner('/api/experiments/'+planId)).body.arms[assigned.arm];
  assert.equal(count.assignments,1);assert.equal(count.impressions,1);assert.equal(count.goals,1);
  assert.equal(count.rate,100); // descriptive 1/1 in test, not proof of lift
});
test('WAVE 3: unsigned browser events cannot count toward actual outcomes',async()=>{
  const spoof=await owner('/api/integrations/v2/experiment-event','POST',{
    experimentId:planId,visitorKey:'visitor_not_signed_0000',kind:'goal',eventId:'fake-wave3-event'});
  assert.equal(spoof.status,404,'browser request without partner identity must be denied');
  const invalid=await fetch(origin+'/api/integrations/v2/experiment-event',{method:'POST',headers:{'content-type':'application/json','x-pz-platform':'real_wave3','x-pz-timestamp':String(Math.floor(Date.now()/1000)),'x-pz-signature':'sha256=fake'},body:JSON.stringify({experimentId:planId,visitorKey:'visitor_signed_fake_0001',kind:'goal',eventId:'fake-wave3-event-2'})});
  assert.equal(invalid.status,401);
});
test('WAVE 3: draft plan can be activated later and owner can pause an active plan',async()=>{
  const created=await owner('/api/business-briefs/'+submissionId+'/experiments','POST',{
    controlBranchId:rootId,treatmentBranchId:variantId,metric:'signup',hypothesis:'Переформулировка может повысить интерес к портфолио.'});
  assert.equal(created.body.status,'draft');
  const started=await owner('/api/experiments/'+created.body.id+'/activate','POST',{platformKey:'real_wave3'});
  assert.equal(started.body.status,'ready');
  const paused=await owner('/api/experiments/'+created.body.id+'/pause','POST',{});
  assert.equal(paused.body.status,'paused');
  await assert.rejects(partner.assignExperiment({experimentId:created.body.id,visitorKey:'another_test_subject_0001'}),e=>e.status===409);
});
test('WAVE 5: removing business browser data cascades private plans but keeps anonymised public lineage',async()=>{
  const publicBefore=(await stranger('/api/branches/'+variantId)).body;
  assert.equal(publicBefore.brand,'EXPERIMENTAL BRAND');
  assert(db.prepare('SELECT COUNT(*) AS n FROM campaign_experiments').get().n>=2);
  const deleted=await owner('/api/privacy/delete','POST',{});
  assert.equal(deleted.status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM campaign_experiments').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM experiment_assignments').get().n,0);
  assert.equal((await stranger('/api/branches/'+variantId)).status,200);
});
