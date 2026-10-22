'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {openDatabase,uid}=require('../src/database');
const {createSubmission,reviewSubmission}=require('../src/submissions');
const REVIEWS=require('../src/review-rooms');
const PILOTS=require('../src/pilots');
const {commercialMaintenance}=require('../src/commercial-maintenance');
const {maintenance}=require('../src/maintenance');
const {doctor}=require('../src/doctor');
const payload={brand:'CLEAN TEST BRAND',title:'Креативная кампания для компании',category:'Технологические услуги',short:'Тестовая команда готовит рекламную кампанию для профессиональной аудитории.',audience:'Менеджеры, которые заинтересованы в рекламе для компаний',promise:'Познакомить пользователей с доступными услугами через реальные примеры',evidence:'Демонстрационные сведения проверяет оператор и владелец бренда.',visual:'Контрастный заголовок с читаемой типографикой',hook:'Дизайн, который легко понять сегодня',tone:'Деловой',cta:'Посмотреть примеры нашего дизайна',website:'',contactEmail:'',contactConsent:false,rightsConfirmed:true,publicConfirmed:true};
function fixture(){
 const dir=mkdtempSync(path.join(os.tmpdir(),'pz23-ops-'));
 const file=path.join(dir,'a.sqlite'),db=openDatabase(file);
 const owner=uid(24),visitor=uid(24);
 db.prepare('INSERT INTO sessions(id) VALUES(?)').run(owner);
 db.prepare('INSERT INTO sessions(id) VALUES(?)').run(visitor);
 const submission=createSubmission(db,owner,payload);
 const approved=reviewSubmission(db,submission.id,'approved','Проверено оператором перед запуском демонстрации');
 return{db,dir,file,owner,visitor,submission:submission.id,branch:approved.rootId,cleanup(){db.close();rmSync(dir,{force:true,recursive:true});}};
}
test('WAVE 10: complete SQLite doctor and schema open idempotently while existing branches survive',()=>{
 const f=fixture();try{
  const first=doctor(f.db);
  assert.equal(first.ok,true);assert.equal(first.foreignKeyErrors,0);
  assert.equal(first.counts.verifiedPayments,0);
  assert.equal(first.verifiedPaymentsStatus,'NOT_SUPPORTED');
  assert(first.exclusions.includes('payment settlement'));
  const branchId=f.branch, before=f.db.prepare('SELECT hook FROM branches WHERE id=?').get(branchId).hook;
  f.db.close();const reopened=openDatabase(f.file);
  assert.equal(reopened.prepare('SELECT hook FROM branches WHERE id=?').get(branchId).hook,before);
  assert.equal(doctor(reopened).ok,true);reopened.close();
  // Already closed inside this test.
  rmSync(f.dir,{force:true,recursive:true});
 }catch(e){rmSync(f.dir,{force:true,recursive:true});throw e;}
});
test('WAVE 06: guest link expires, moderation blocks snapshot even before expiry, and owner can revoke',()=>{
 const f=fixture();try{
  const r=REVIEWS.createRoom(f.db,f.owner,f.submission,{branchIds:[f.branch],expiresInDays:7});
  assert.equal(REVIEWS.publicRoom(f.db,r.token,f.visitor).variants.length,1);
  f.db.prepare("UPDATE branches SET moderation_status='hidden' WHERE id=?").run(f.branch);
  assert.throws(()=>REVIEWS.publicRoom(f.db,r.token,f.visitor),e=>e.code==='MODERATED');
  f.db.prepare("UPDATE branches SET moderation_status='visible' WHERE id=?").run(f.branch);
  f.db.prepare("UPDATE review_rooms SET expires_at=datetime('now','-1 day') WHERE id=?").run(r.id);
  assert.throws(()=>REVIEWS.publicRoom(f.db,r.token,f.visitor),e=>e.code==='REVIEW_CLOSED');
 }finally{f.cleanup();}
});
test('WAVE 10: expired room and feedback deleted only after preview + backup confirmation',()=>{
 const f=fixture();try{
  const r=REVIEWS.createRoom(f.db,f.owner,f.submission,{branchIds:[f.branch],expiresInDays:7});
  REVIEWS.sendFeedback(f.db,r.token,f.visitor,{branchId:f.branch,score:3,comment:'Достаточно понятный вариант текста для рекламы'});
  f.db.prepare("UPDATE review_rooms SET expires_at=datetime('now','-60 days') WHERE id=?").run(r.id);
  const dry=commercialMaintenance(f.db);
  assert.equal(dry.dryRun,true);assert.equal(dry.eligible.expiredReviewRooms,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM review_feedback').get().n,1);
  assert.throws(()=>commercialMaintenance(f.db,{execute:true}),/резервную копию/);
  const done=commercialMaintenance(f.db,{execute:true,confirmBackup:true});
  assert.equal(done.dryRun,false);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM review_rooms').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM review_feedback').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM branches WHERE id=?').get(f.branch).n,1);
 }finally{f.cleanup();}
});
test('WAVE 10: old sessions with active guest feedback or pilot ownership are excluded from idle cleanup',()=>{
 const f=fixture();try{
  const r=REVIEWS.createRoom(f.db,f.owner,f.submission,{branchIds:[f.branch],expiresInDays:7});
  REVIEWS.sendFeedback(f.db,r.token,f.visitor,{branchId:f.branch,score:5,comment:'В этом варианте рекламный смысл стал гораздо яснее'});
  f.db.prepare("UPDATE sessions SET last_seen_at=datetime('now','-200 days') WHERE id IN (?,?)").run(f.owner,f.visitor);
  const preview=maintenance(f.db);
  assert.equal(preview.eligible.idleUnusedSessions,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id IN (?,?)').get(f.owner,f.visitor).n,2);
 }finally{f.cleanup();}
});
test('WAVE 09: operator cannot fake accepted pilot, quotes must be in configured bounds, and closing is audited',()=>{
 const f=fixture();try{
  const id=PILOTS.submit(f.db,f.owner,f.submission,{objective:'Проверить рекламные варианты на релевантной аудитории',budgetBand:'unknown'}).id;
  assert.throws(()=>PILOTS.operatorAction(f.db,id,'accepted',{explanation:'От имени клиента'}),e=>e.status===400);
  assert.throws(()=>PILOTS.operatorAction(f.db,id,'proposal_sent',{explanation:'Недостаточная сумма предложения',proposal:'Проверка рекламы, подготовка двух креативов и отчёта',quoteEurCents:0}),/Укажите сумму/);
  const ok=PILOTS.operatorAction(f.db,id,'proposal_sent',{explanation:'Рассмотрена заявка и определён состав работ',proposal:'Создать варианты, провести ручной разбор, подготовить отчёт об ограничениях рекламы.',quoteEurCents:19000});
  assert.equal(ok.status,'proposal_sent');
  const accepted=PILOTS.ownerAction(f.db,f.owner,id,'accept');
  assert.equal(accepted.status,'accepted');assert.equal(accepted.paymentStatus,'not_integrated');
  assert.throws(()=>PILOTS.operatorAction(f.db,id,'declined',{explanation:'Попытка переписать решение клиента'}),e=>e.code==='INVALID_STATUS');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pilot_audit WHERE pilot_id=?').get(id).n,3);
 }finally{f.cleanup();}
});
test('WAVE 10: old accepted interest can be purged; active requests remain',()=>{
 const f=fixture();try{
  const id=PILOTS.submit(f.db,f.owner,f.submission,{objective:'Измерить реакцию целевой аудитории на новый заголовок',budgetBand:'under_500'}).id;
  PILOTS.operatorAction(f.db,id,'proposal_sent',{explanation:'Коммерческое предложение подготовлено оператором',proposal:'Подготовить два заголовка и отчёт о количестве показов без обещаний продаж.',quoteEurCents:15000});
  PILOTS.ownerAction(f.db,f.owner,id,'accept');
  f.db.prepare("UPDATE pilot_requests SET updated_at=datetime('now','-380 days') WHERE id=?").run(id);
  const before=commercialMaintenance(f.db);
  assert.equal(before.eligible.concludedPilotRequests,1);
  commercialMaintenance(f.db,{execute:true,confirmBackup:true});
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pilot_requests WHERE id=?').get(id).n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM branches WHERE id=?').get(f.branch).n,1);
 }finally{f.cleanup();}
});
