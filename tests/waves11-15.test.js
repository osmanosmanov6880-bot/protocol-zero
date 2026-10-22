'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-wave15-'));
const liveSecret=crypto.randomBytes(48).toString('hex');
process.env.DB_PATH=path.join(dir,'wave15.sqlite');
process.env.PZ_WAVE15_LIVE_SECRET=liveSecret;
process.env.PZ_PLATFORMS_FILE=path.join(dir,'platforms.json');
fs.writeFileSync(process.env.PZ_PLATFORMS_FILE,JSON.stringify([{key:'verified_lab',name:'Тестовый живой адаптер',url:'https://partner.example/',mode:'live',secretEnv:'PZ_WAVE15_LIVE_SECRET',capabilities:['text']}]));
const {server,db}=require('../src/server');
const {reviewSubmission}=require('../src/submissions');
const {createNodePartner}=require('../sdk/node-partner');
const PILOTS=require('../src/pilots');
const MILESTONES=require('../src/pilot-milestones');
const {openDatabase}=require('../src/database');
let base,owner,visitor,stranger,more,brief,root,child,child2,partner;
function client(){let cookie='';return async(url,method='GET',body)=>{const headers={};if(cookie)headers.cookie=cookie;if(body!==undefined)headers['content-type']='application/json';const res=await fetch(base+url,{method,headers,redirect:'manual',body:body===undefined?undefined:JSON.stringify(body)});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];const type=res.headers.get('content-type')||'';return{status:res.status,body:type.includes('json')?await res.json():await res.text(),cookie};};}
const draft={brand:'TEST BRAND W15',title:'Честная реклама дизайн-студии',category:'Креативные услуги',short:'Рабочая студия коммуникаций, которая демонстрирует свои услуги и готовит примеры рекламных материалов.',audience:'Малые команды и компании, которым нужны профессиональные рекламные сообщения',promise:'Представить реальные примеры услуг и выяснить, какие сообщения понятнее аудитории',evidence:'Никакие показатели эффективности не заявляются, рекламные утверждения требуют подтверждения.',visual:'Доступная типографика, настоящие примеры работ команды',hook:'Свежий взгляд на вашу рекламу',tone:'Деловой',cta:'Посмотреть примеры работ команды',website:'',contactEmail:'',contactConsent:false,rightsConfirmed:true,publicConfirmed:true};
before(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  owner=client();visitor=client();stranger=client();more=client();
  for(const call of [owner,visitor,stranger,more])await call('/api/bootstrap');
  brief=(await owner('/api/business-briefs','POST',draft)).body.id;
  root=reviewSubmission(db,brief,'approved','Ручная проверка для тестирования подготовленного рекламного брифа').rootId;
  child=(await visitor('/api/mutations','POST',{parentId:root,gene:'hook',value:'Идеям нужен свой рекламный голос'})).body.id;
  child2=(await more('/api/mutations','POST',{parentId:root,gene:'cta',value:'Открыть библиотеку примеров работ'})).body.id;
  partner=createNodePartner({portalUrl:base,platformKey:'verified_lab',secret:liveSecret,allowLocalHttp:true});
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});

test('WAVE 11: campaign control is owner-only, and pause leaves existing branches readable',async()=>{
  const api='/api/business-briefs/'+brief+'/control';
  assert.equal((await stranger(api)).status,403);
  assert.equal((await stranger(api,'PUT',{status:'paused',reason:'Я посторонний участник, прав нет'})).status,403);
  assert.equal((await owner(api,'PUT',{status:'paused',reason:'Бренд проверяет юридические формулировки'})).body.status,'paused');
  assert.equal((await visitor('/api/branches/'+child)).status,200);
  assert.equal((await visitor('/api/mutations','POST',{parentId:child,gene:'cta',value:'Посмотреть другие честные работы'})).body.code,'CAMPAIGN_PAUSED');
  assert.equal((await visitor('/api/branches/'+child+'/invites','POST',{})).body.code,'CAMPAIGN_PAUSED');
  const logs=(await owner(api)).body.log;assert.equal(logs.length,1);
  assert.equal((await owner(api,'PUT',{status:'open',reason:'Текст прошёл повторную внутреннюю проверку'})).body.status,'open');
  assert.equal((await owner(api,'PUT',{status:'open',reason:'Повторное открытие без изменения статуса'})).status,409);
  assert.equal((await stranger('/api/branches/'+child)).body.campaignStatus,'open');
});

test('WAVE 12: creative packs are immutable, private, exact and tamper-evident',async()=>{
  const pathBase='/api/business-briefs/'+brief+'/packs';
  assert.equal((await stranger(pathBase,'POST',{label:'Чужая подборка',purpose:'internal',branchIds:[child]})).status,403);
  assert.equal((await owner(pathBase,'POST',{label:'Выбор корня',purpose:'internal',branchIds:[root]})).status,403);
  const data=(await owner(pathBase,'POST',{label:'Подборка на первое обсуждение',purpose:'client_review',branchIds:[child,child2]}));
  assert.equal(data.status,201);const pack=data.body;
  assert.equal(pack.content.variants.length,2);assert.equal(pack.content.variants[0].headline,'Идеям нужен свой рекламный голос');
  assert(!JSON.stringify(pack).includes('session_'));
  assert.equal((await stranger('/api/packs/'+pack.id)).status,403);
  assert.equal((await owner('/api/packs/'+pack.id)).body.sha256,pack.sha256);
  assert.equal((await owner(pathBase)).body.packs.length,1);
  db.prepare('UPDATE creative_packs SET snapshot_json=? WHERE id=?').run('{"tampered":true}',pack.id);
  assert.equal((await owner('/api/packs/'+pack.id)).body.code,'PACK_TAMPERED');
  db.prepare('UPDATE creative_packs SET snapshot_json=? WHERE id=?').run(JSON.stringify(pack.content),pack.id);
  assert.equal((await owner('/api/packs/'+pack.id)).status,200);
});

test('WAVE 13: closure stops signed external assignments and events and freezes a signed-data snapshot',async()=>{
  const created=await owner('/api/business-briefs/'+brief+'/experiments','POST',{
    controlBranchId:root,treatmentBranchId:child,metric:'lead',hypothesis:'Тест показывает понять ли человеку вариант призыва без вымышленных продаж.',platformKey:'verified_lab'});
  assert.equal(created.status,201);const id=created.body.id;
  const visitorKey='participant_unique_test_identifier_1234';
  const assignment=await partner.assignExperiment({experimentId:id,visitorKey});
  assert(['A','B'].includes(assignment.arm));
  await partner.recordExperiment({experimentId:id,visitorKey,kind:'impression',eventId:'impression-wave15-test001'});
  assert.equal((await stranger('/api/experiments/'+id+'/closure')).status,403);
  const closed=await owner('/api/experiments/'+id+'/close','POST',{reason:'Остановили контролируемый тест после внутренней проверки показов'});
  assert.equal(closed.status,201);assert.equal(closed.body.snapshot.audit.totalAssignments,1);
  assert.equal(closed.body.snapshot.audit.arms.A.impressions+closed.body.snapshot.audit.arms.B.impressions,1);
  assert.equal(closed.body.snapshot.audit.arms.A.goals+closed.body.snapshot.audit.arms.B.goals,0);
  assert.equal((await owner('/api/experiments/'+id)).body.closed,true);
  assert.equal((await owner('/api/experiments/'+id+'/close','POST',{reason:'Повторно пытаемся завершить завершённый эксперимент'})).status,409);
  await assert.rejects(partner.assignExperiment({experimentId:id,visitorKey:'another_unique_participant_00000012'}),e=>e.status===409);
  await assert.rejects(partner.recordExperiment({experimentId:id,visitorKey,kind:'goal',eventId:'goal-wave15-test0001'}),e=>e.status===409);
  const frozen=await owner('/api/experiments/'+id+'/closure');assert.equal(frozen.status,200);
  assert.equal(frozen.body.sha256,closed.body.sha256);
  assert(!frozen.body.snapshot.decision?.includes('winner'));
});

test('WAVE 14: operator milestones need accepted pilot, client may acknowledge or request rework',async()=>{
  const pathBase='/api/business-briefs/'+brief+'/pilots';
  const r=await owner(pathBase,'POST',{objective:'Заказать ограниченный тест двух разных рекламных формулировок для посетителей магазина',budgetBand:'under_500'});
  assert.equal(r.status,201);const id=r.body.id;
  assert.throws(()=>MILESTONES.create(db,id,'Тестовая подборка','Подготовить два рекламных сообщения для клиента'),e=>e.code==='PILOT_NOT_ACCEPTED');
  PILOTS.operatorAction(db,id,'proposal_sent',{explanation:'Ручной разбор задачи и стоимости для пилота',proposal:'Сначала готовим два варианта и предоставляем обзор для согласования без обещаний продаж.',quoteEurCents:30000});
  assert.equal((await owner('/api/pilots/'+id+'/accept','POST',{})).status,200);
  const m=MILESTONES.create(db,id,'Подготовка материалов','Подготовить тексты рекламы и передать клиенту на ознакомление');
  assert.equal(m.status,'planned');
  assert.equal((await stranger('/api/pilots/'+id+'/milestones')).status,403);
  assert.equal((await owner('/api/pilots/'+id+'/milestones/'+m.id+'/review','PUT',{decision:'acknowledged',note:'Ознакомился с промежуточными материалами'})).status,409);
  assert.equal(MILESTONES.submit(db,id,m.id,'Переданы два текстовых варианта на рассмотрение').status,'submitted');
  const change=await owner('/api/pilots/'+id+'/milestones/'+m.id+'/review','PUT',{decision:'changes_requested',note:'Уточнить призыв, сохранить исходные характеристики услуги'});
  assert.equal(change.status,200);assert.equal(change.body.status,'changes_requested');
  assert.equal((await stranger('/api/pilots/'+id+'/milestones/'+m.id+'/review','PUT',{decision:'acknowledged',note:'Не моя кампания и не мой доступ'})).status,403);
  assert.equal(MILESTONES.submit(db,id,m.id,'Заголовок исправлен по замечаниям клиента').status,'submitted');
  assert.equal((await owner('/api/pilots/'+id+'/milestones/'+m.id+'/review','PUT',{decision:'acknowledged',note:'Вторая версия просмотрена, вопрос закрыт'})).body.status,'acknowledged');
  assert.equal((await owner('/api/pilots/'+id+'/milestones/'+m.id+'/review','PUT',{decision:'acknowledged',note:'Пытаемся повторно подтвердить то же самое'})).status,409);
  assert.equal(MILESTONES.operatorList(db,id).milestones[0].status,'acknowledged');
});

test('WAVE 15: facts-only overview is owner-only, accurately counts activity, never revenue',async()=>{
  const uri='/api/business-briefs/'+brief+'/overview';
  assert.equal((await stranger(uri)).status,403);
  const summary=await owner(uri);assert.equal(summary.status,200);
  assert.equal(summary.body.counts.creativePacks,1);
  assert.equal(summary.body.counts.visibleVariants,2);
  assert.equal(summary.body.counts.closedExperiments,1);
  assert.equal(summary.body.counts.experimentPlans,1);
  assert.equal(summary.body.counts.milestoneAcknowledgements,1);
  assert.equal(summary.body.counts.pilotRequests,1);
  assert.equal(summary.body.counts.signedLiveGoals,0);
  assert.equal(summary.body.caveats.some(s=>s.includes('не означают выручку')),true);
  assert(!('revenue' in summary.body.counts));
  const myData=await owner('/api/privacy/export');assert.equal(myData.status,200);
  assert.equal(myData.body.packs.length,1);assert.equal(myData.body.closures.length,1);
  assert.equal(myData.body.milestones.length,1);
});

test('WAVE 15 migration is idempotent and SQLite integrity remains healthy',()=>{
  require('../src/waves11-15-schema').migrateWaves1115(db);
  const control=db.prepare('SELECT status FROM campaign_controls WHERE campaign_id=(SELECT campaign_id FROM brand_submissions WHERE id=?)').get(brief);
  assert.equal(control.status,'open');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const tmpdb=openDatabase(path.join(dir,'migration-fresh.sqlite'));
  assert(tmpdb.prepare("SELECT name FROM sqlite_master WHERE name='creative_packs'").get());
  tmpdb.close();
});

test('WAVE 11: operator can recover a paused campaign without impersonating its author',async()=>{
  const {operatorUpdate}=require('../src/campaign-control');
  const base='/api/business-briefs/'+brief+'/control';
  assert.equal((await owner(base,'PUT',{status:'paused',reason:'Заморозка кампании на время проверки клиента'})).status,200);
  assert.equal(operatorUpdate(db,brief,'open','Внутренняя проверка завершена, оператор разрешил публикацию').actor,'operator');
  const audit=db.prepare('SELECT reason FROM campaign_control_log WHERE campaign_id=(SELECT campaign_id FROM brand_submissions WHERE id=?) ORDER BY id DESC LIMIT 1').get(brief);
  assert(audit.reason.startsWith('ОПЕРАТОР: '));
  assert.equal((await stranger('/api/branches/'+child)).body.campaignStatus,'open');
});

test('WAVE 12: unpublished variant cannot be leaked via a previously created pack',async()=>{
  const {moderationSet}=require('../src/database');
  const packId=(await owner('/api/business-briefs/'+brief+'/packs')).body.packs[0].id;
  moderationSet(db,child,'hidden','Проверка публикуемого заголовка кампании');
  assert.equal((await owner('/api/packs/'+packId)).body.code,'MODERATED');
  moderationSet(db,child,'visible','Заголовок снова допущен после ручной проверки');
  assert.equal((await owner('/api/packs/'+packId)).status,200);
});

test('WAVE 13: frozen report cannot be silently rewritten without a detected hash mismatch',async()=>{
  const closed=db.prepare('SELECT experiment_id AS id,snapshot_json AS snapshot FROM experiment_closures LIMIT 1').get();
  assert(closed);
  db.prepare('UPDATE experiment_closures SET snapshot_json=? WHERE experiment_id=?').run(JSON.stringify({impressions:9999999}),closed.id);
  assert.equal((await owner('/api/experiments/'+closed.id+'/closure')).body.code,'CLOSURE_TAMPERED');
  db.prepare('UPDATE experiment_closures SET snapshot_json=? WHERE experiment_id=?').run(closed.snapshot,closed.id);
  assert.equal((await owner('/api/experiments/'+closed.id+'/closure')).status,200);
});

test('WAVE 14: operator rejects fake milestones and illegal resubmission after acknowledgement',()=>{
  const pilotId=db.prepare("SELECT id FROM pilot_requests WHERE status='accepted' LIMIT 1").get().id;
  const milestone=MILESTONES.operatorList(db,pilotId).milestones[0];
  assert.throws(()=>MILESTONES.submit(db,pilotId,milestone.id,'Повторная фиктивная передача файла'),e=>e.code==='MILESTONE_STATE');
  assert.throws(()=>MILESTONES.create(db,pilotId,'A','слишком короткое описание'),e=>e.status===400);
  const audit=db.prepare('SELECT actor,from_status,to_status FROM pilot_milestone_log WHERE milestone_id=? ORDER BY id').all(milestone.id);
  assert.deepEqual(audit.map(x=>x.to_status),['planned','submitted','changes_requested','submitted','acknowledged']);
});

test('WAVE 15: removal erases private packs, closures, reviews, pilot stages but retains anonymous public creations',async()=>{
  const deleted=await owner('/api/privacy/delete','POST',{});
  assert.equal(deleted.status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM creative_packs').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM campaign_experiments').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM experiment_closures').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pilot_requests').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pilot_milestones').get().n,0);
  assert.equal((await stranger('/api/branches/'+child)).status,200);
});
