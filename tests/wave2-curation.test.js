'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');const fs=require('node:fs');const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-wave2-'));
process.env.DB_PATH=path.join(dir,'test.db');
const {server,db}=require('../src/server');
const {reviewSubmission}=require('../src/submissions');
const {moderationSet}=require('../src/database');
let origin;
function client(){let cookie='';return async(url,method='GET',data)=>{const headers={};if(cookie)headers.cookie=cookie;if(data!==undefined)headers['content-type']='application/json';const r=await fetch(origin+url,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,body:await r.json()};};}
const draft=(brand)=>({brand,title:'Новая творческая кампания',category:'Дизайн-услуги',short:'Демонстрация портфолио и знакомство с настоящей студией.',audience:'Заказчики визуальных коммуникаций и фирменного стиля',promise:'Рассказать о работе студии и показать выполненные проекты',evidence:'Источники необходимо проверить вручную перед публикацией.',visual:'Реальная фотография работ, выразительная типографика',hook:'Дизайн начинается с хороших вопросов',tone:'Деловой',cta:'Посмотреть портфолио студии',website:'',contactEmail:'',contactConsent:false,rightsConfirmed:true,publicConfirmed:true});
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('WAVE 2: private shortlisting follows approved visible business lineage',async()=>{
  const brand=client(),creator=client(),outsider=client();await brand('/api/bootstrap');await creator('/api/bootstrap');await outsider('/api/bootstrap');
  const sub=(await brand('/api/business-briefs','POST',draft('WAVE TWO BRAND'))).body;
  const root=reviewSubmission(db,sub.id,'approved','Подтверждённая ручная проверка тестовой рекламной заявки').rootId;
  const child=(await creator('/api/mutations','POST',{parentId:root,gene:'hook',value:'Фирменный стиль начинается с разговора'})).body;
  const record=await brand('/api/business-briefs/'+sub.id+'/reviews','PUT',{branchId:child.id,status:'shortlisted',note:'Проверить среди дизайнеров'});
  assert.equal(record.status,200);
  const variants=(await brand('/api/business-briefs/'+sub.id+'/variants')).body.variants;
  assert.equal(variants[0].reviewStatus,'shortlisted');assert.equal(variants[0].reviewNote,'Проверить среди дизайнеров');
  assert.equal((await outsider('/api/business-briefs/'+sub.id+'/reviews')).status,403);
  assert.equal((await outsider('/api/business-briefs/'+sub.id+'/reviews','PUT',{branchId:child.id,status:'discarded',note:''})).status,403);
  const customer=(await creator('/api/privacy/export')).body;assert.equal(customer.reviews.length,0);
  assert.equal((await brand('/api/privacy/export')).body.reviews[0].status,'shortlisted');
  moderationSet(db,child.id,'hidden','Контрольное снятие с публикации для теста');
  assert.equal((await brand('/api/business-briefs/'+sub.id+'/variants')).body.variants.length,0);
  assert.equal((await brand('/api/business-briefs/'+sub.id+'/reviews')).body.reviews.length,0);
});
test('WAVE 2: root cannot be shortlisted as a community contribution',async()=>{
  const owner=client();await owner('/api/bootstrap');
  const sub=(await owner('/api/business-briefs','POST',draft('ROOT GUARD BRAND'))).body;
  const root=reviewSubmission(db,sub.id,'approved','Подробная проверка исходных рекламных заявлений').rootId;
  assert.equal((await owner('/api/business-briefs/'+sub.id+'/reviews','PUT',{branchId:root,status:'shortlisted',note:''})).status,403);
});
