'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz13-intake-'));
process.env.DB_PATH=path.join(dir,'test.db');
const {server,db}=require('../src/server');
const {reviewSubmission}=require('../src/submissions');
const {createNodePartner}=require('../sdk/node-partner');
let origin='';
function client(){
  let cookie='';
  return async(route,method='GET',data)=>{
    const headers={};if(cookie)headers.cookie=cookie;
    if(data!==undefined)headers['content-type']='application/json';
    const r=await fetch(origin+route,{method,headers,redirect:'manual',body:data!==undefined?JSON.stringify(data):undefined});
    const setCookie=r.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
    let result;const contentType=r.headers.get('content-type')||'';
    if(contentType.includes('json'))result=await r.json();else result=await r.text();
    return {status:r.status,body:result,headers:r.headers};
  };
}
const draft=()=>({brand:'ATELIER NORTH',title:'Знакомство с командой студии',category:'Локальные услуги',
  short:'Небольшая дизайн-студия показывает свои проекты и способы связи с командой.',
  audience:'Люди, которые ищут графический дизайн для своего бизнеса',
  promise:'Познакомить потенциальных клиентов с портфолио дизайн-студии',
  evidence:'Все сведения предоставлены заявителем. Нельзя обещать непроверенную эффективность.',
  visual:'Настоящие фотографии работ и выразительная типографика',
  hook:'Идеи с характером для вашей компании',tone:'Деловой',cta:'Посмотреть избранные проекты',
  website:'https://example.org/',contactEmail:'',contactConsent:false,rightsConfirmed:true,publicConfirmed:true
});
before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});});

test('Real campaign is NOT published by submission; only its creator can read it',async()=>{
  const anna=client(),ben=client();
  await anna('/api/bootstrap');await ben('/api/bootstrap');
  const initial=(await anna('/api/bootstrap')).body.roots.length;
  const submitted=await anna('/api/business-briefs','POST',draft());
  assert.equal(submitted.status,201);assert.equal(submitted.body.status,'pending');
  const id=submitted.body.id;
  assert.equal((await anna('/api/business-briefs')).body.submissions[0].id,id);
  assert.equal((await ben('/api/business-briefs')).body.submissions.length,0);
  const after=(await ben('/api/bootstrap')).body;
  assert.equal(after.roots.length,initial);
  assert.equal(JSON.stringify(after).includes('ATELIER NORTH'),false,'pending business claims must not be public');
  assert.equal((await anna('/submit')).status,200);
  assert.equal((await anna('/api/privacy/export')).body.submissions.length,1);
});

test('Explicit rights and disclosure, safe text, website and server validation are mandatory',async()=>{
  const who=client();await who('/api/bootstrap');
  for(const change of [
    {rightsConfirmed:false},{publicConfirmed:false},{short:'too short'},
    {hook:'<script>alert(1)</script>'},{website:'http://evil.test/'},
    {website:'https://user:pass@evil.test/'},{website:'javascript:alert(1)'}
  ]){
    const response=await who('/api/business-briefs','POST',{...draft(),...change});
    assert.equal(response.status,400,'must reject '+JSON.stringify(change));
  }
  const invalid=await who('/api/business-briefs','POST',{...draft(),tone:'Пугающий'});
  assert.equal(invalid.status,400);
  assert.equal((await who('/api/business-briefs')).body.submissions.length,0);
});

test('Owner may withdraw pending brief; operator cannot publish withdrawn and duplicate review cannot overwrite',async()=>{
  const who=client(),other=client();await who('/api/bootstrap');await other('/api/bootstrap');
  const {id}=(await who('/api/business-briefs','POST',{...draft(),brand:'SECOND BRAND'})).body;
  const foreign=await other('/api/business-briefs/'+id+'/withdraw','POST',{});assert.equal(foreign.status,403);
  const done=await who('/api/business-briefs/'+id+'/withdraw','POST',{});assert.equal(done.status,200);assert.equal(done.body.status,'withdrawn');
  assert.equal((await who('/api/business-briefs/'+id+'/withdraw','POST',{})).status,409);
  assert.throws(()=>reviewSubmission(db,id,'approved','Ручная проверка и согласие на публикацию'),/отозвана|рассмотрена/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM campaigns WHERE brand=?').get('SECOND BRAND').n,0);
});

test('Operator manual review creates a new public root and permits a true lineage + business brief',async()=>{
  const owner=client(),player=client();await owner('/api/bootstrap');await player('/api/bootstrap');
  const request=(await owner('/api/business-briefs','POST',{...draft(),brand:'THIRD BRAND'})).body;
  const approved=reviewSubmission(db,request.id,'approved','Ручная проверка содержания и разрешение владельца на тестовую публикацию');
  assert.equal(approved.decision,'approved');assert.match(approved.campaignId,/^BR-/);
  assert.throws(()=>reviewSubmission(db,request.id,'approved','Повторное решение не разрешено'),/уже рассмотрена/);
  const published=(await player('/api/bootstrap')).body.roots.find(b=>b.id===approved.rootId);
  assert.equal(published.brand,'THIRD BRAND');assert.equal(published.origin,'community');
  assert.equal(published.generation,0);
  const mutation=await player('/api/mutations','POST',{parentId:approved.rootId,gene:'hook',value:'Дизайн начинается с понимания вашей задачи'});
  assert.equal(mutation.status,201);assert.equal(mutation.body.origin,'community');
  const brief=(await player('/api/branches/'+mutation.body.id+'/brief')).body;
  assert.equal(brief.demoBrand,false);assert.equal(brief.brand,'THIRD BRAND');
  assert.equal((await owner('/api/business-briefs')).body.submissions.find(x=>x.id===request.id).status,'approved');
  assert.equal((await owner('/api/business-briefs/'+request.id+'/withdraw','POST',{})).status,409);
});

test('Deleting anonymous session removes submitted data and review logs, preserving anonymized public campaign',async()=>{
  const person=client(),reader=client();await person('/api/bootstrap');await reader('/api/bootstrap');
  const req=(await person('/api/business-briefs','POST',{...draft(),brand:'FOURTH BRAND'})).body;
  const result=reviewSubmission(db,req.id,'approved','Ручная оценка прав и безопасное тестовое решение о публикации');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM brand_review_log WHERE submission_id=?').get(req.id).n,1);
  assert.equal((await person('/api/privacy/delete','POST',{})).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM brand_submissions WHERE id=?').get(req.id).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM brand_review_log WHERE submission_id=?').get(req.id).n,0);
  const still=(await reader('/api/branches/'+result.rootId)).body;
  assert.equal(still.brand,'FOURTH BRAND');
});

test('Business submission throttling is server-side, not a fake UI limit',async()=>{
  const sender=client();await sender('/api/bootstrap');
  for(let i=0;i<3;i++)assert.equal((await sender('/api/business-briefs','POST',{...draft(),brand:'BRAND TEST '+i})).status,201);
  const blocked=await sender('/api/business-briefs','POST',{...draft(),brand:'EXTRA BRAND'});
  assert.equal(blocked.status,429);
});

test('Partner SDK refuses untrusted HTTP and validates its inputs without leaking signing keys',async()=>{
  assert.throws(()=>createNodePartner({portalUrl:'http://evil.example',platformKey:'partner1',secret:'x'.repeat(64),allowLocalHttp:true}),/HTTPS/);
  assert.throws(()=>createNodePartner({portalUrl:'https://example.com/redirect',platformKey:'partner1',secret:'x'.repeat(64)}),/HTTPS/);
  assert.throws(()=>createNodePartner({portalUrl:'https://example.com/',platformKey:'partner1',secret:'short'}),/Секрет/);
  const partner=createNodePartner({portalUrl:origin,platformKey:'sandbox13',secret:'x'.repeat(64),allowLocalHttp:true});
  await assert.rejects(partner.resolve('invalid'),/Некорректный/);
  await assert.rejects(partner.confirm({handoffId:'a'.repeat(32),eventId:'an-event-123',actionType:'purchase',objectId:'saved-item-123'}),/Некорректные/);
  await assert.rejects(partner.resolve('a'.repeat(32)),/платформа не подключена/i);
  assert.equal('secret' in partner,false);
});

test('Optional contact email needs its own consent and never becomes a public campaign field',async()=>{
  const owner=client(),guest=client();await owner('/api/bootstrap');await guest('/api/bootstrap');
  const missingConsent=await owner('/api/business-briefs','POST',{...draft(),brand:'FIFTH BRAND',contactEmail:'owner@example.org',contactConsent:false});
  assert.equal(missingConsent.status,400);
  const accepted=await owner('/api/business-briefs','POST',{...draft(),brand:'FIFTH BRAND',contactEmail:'owner@example.org',contactConsent:true});
  assert.equal(accepted.status,201);
  const id=accepted.body.id;
  assert.equal(db.prepare('SELECT contact_email FROM brand_submissions WHERE id=?').get(id).contact_email,'owner@example.org');
  const approved=reviewSubmission(db,id,'approved','Ручная проверка описания, прав и согласия для публикации');
  const publicBody=JSON.stringify((await guest('/api/bootstrap')).body);
  assert.equal(publicBody.includes('owner@example.org'),false);
  assert.equal(JSON.stringify((await guest('/api/branches/'+approved.rootId)).body).includes('owner@example.org'),false);
  assert.equal((await owner('/api/business-briefs')).body.submissions.find(x=>x.id===id).contactEmail,'owner@example.org');
  assert.ok((await owner('/api/privacy/export')).body.submissions.find(x=>x.id===id).contactEmail);
});

test('Only the submitting business can access lineage exports; hidden origin blocks all generations',async()=>{
  const business=client(),guest=client(),random=client();
  await business('/api/bootstrap');await guest('/api/bootstrap');await random('/api/bootstrap');
  const id=(await business('/api/business-briefs','POST',{...draft(),brand:'SIXTH BRAND'})).body.id;
  assert.equal((await business('/api/business-briefs/'+id+'/variants')).status,409);
  const approved=reviewSubmission(db,id,'approved','Заявка прошла ручную проверку прав и опубликована для тестирования');
  const branch=(await guest('/api/mutations','POST',{parentId:approved.rootId,gene:'hook',value:'Ваш стиль начинается здесь, рядом'})).body;
  assert.equal((await random('/api/business-briefs/'+id+'/variants')).status,403);
  const report=(await business('/api/business-briefs/'+id+'/variants')).body;
  assert.equal(report.variants.length,1);assert.equal(report.variants[0].id,branch.id);
  assert.equal(report.geneCounts.hook,1);assert.equal(report.variants[0].creatorSession,undefined);
  assert.equal(report.variants[0].notes,undefined);
  const {moderationSet}=require('../src/database');
  moderationSet(db,approved.rootId,'hidden','Ручное снятие публикации после замечания рекламодателя');
  assert.equal((await random('/api/branches/'+approved.rootId)).status,403);
  assert.equal((await guest('/api/branches/'+branch.id)).status,403);
  assert.equal((await business('/api/business-briefs/'+id+'/variants')).status,403);
  const current=(await random('/api/bootstrap')).body.roots;
  assert.equal(current.some(x=>x.id===approved.rootId),false);
  const my=(await business('/api/business-briefs')).body.submissions.find(x=>x.id===id);
  assert.equal(my.campaignVisible,0);
  moderationSet(db,approved.rootId,'visible','Восстановление после операторской проверки и исправления замечаний');
  assert.equal((await random('/api/branches/'+branch.id)).status,200);
});
