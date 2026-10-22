'use strict';
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pz-cinema-integrated-'));
process.env.DB_PATH=path.join(tmp,'bridge.sqlite');
const {server,db}=require('../src/server');
let base;
function user(){let cookie='';return async (p,method='GET',payload=null,headers={})=>{
  const h={...headers};if(cookie)h.Cookie=cookie;if(payload!==null)h['Content-Type']='application/json';
  const res=await fetch(base+p,{method,headers:h,body:payload===null?undefined:JSON.stringify(payload)});
  const set=res.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  const type=res.headers.get('content-type')||'';
  const body=type.includes('json')?await res.json():await res.text();return {status:res.status,body,cookie,headers:res.headers};
};}
before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(resolve=>server.close(resolve));try{db.close();}catch{}fs.rmSync(tmp,{recursive:true,force:true});});

test('CINEMA: movie, scenes, assets and modules served by the same origin but private files blocked',async()=>{
 const c=user();for(const file of ['/cinema/','/cinema/prototype/','/cinema/src/app.mjs','/cinema/src/reality.mjs','/cinema/story/engine.mjs','/cinema/src/main.css','/cinema/assets/keyframes/city_dawn-desktop.webp']){
  const response=await c(file);assert.equal(response.status,200,file);
 }
 const absent=await c('/cinema/docs/STYLE_BIBLE.md');assert.equal(absent.status,404);
 const hidden=await c('/cinema/VIEW_OFFLINE.html');assert.equal(hidden.status,404);
 const leaked=await c('/cinema/../src/server.js');assert.notEqual(leaked.status,200);
 const health=await c('/api/health');assert.equal(health.body.version,'3.4.0');
});

test('CINEMA: opt-in public mutation, idempotent replay and genuine second-session descendant',async()=>{
 const alice=user(),bob=user(),eve=user();
 const candidates=await alice('/api/cinema/candidates');assert.equal(candidates.status,200);
 assert.equal(candidates.body.connected,true);assert(candidates.body.branches.length>=3);
 assert(candidates.body.branches.every(b=>b.origin==='demo' && b.campaignStatus==='open'));
 assert(!('creatorSession' in candidates.body.branches[0]),'no session leaked');
 const parent=candidates.body.branches[0];
 const mutation={parentId:parent.id,gene:'hook',value:'Идеи живут, когда их продолжают вместе.',nonce:'cinema-test-mutation-unique-1',consent:true};
 const refused=await alice('/api/cinema/publish','POST',{...mutation,consent:false});assert.equal(refused.status,400);assert.equal(refused.body.code,'CONSENT_REQUIRED');
 const cross=await alice('/api/cinema/publish','POST',mutation,{Origin:'https://example.invalid'});assert.equal(cross.status,403);
 const created=await alice('/api/cinema/publish','POST',mutation);assert.equal(created.status,201,JSON.stringify(created.body));
 const child=created.body.branch;assert.equal(child.parentId,parent.id);assert.equal(child.generation,parent.generation+1);assert.equal(child.changedGene,'hook');
 assert.equal(child.hook,mutation.value);assert.equal(child.cta,parent.cta);assert.equal(child.tone,parent.tone);assert.equal(child.origin,'demo');
 assert.match(created.body.link,/^\/b\//);
 const repeated=await alice('/api/cinema/publish','POST',mutation);
 assert.equal(repeated.status,201);assert.equal(repeated.body.branch.id,child.id,'network retries cannot create new child');
 const tamper=await alice('/api/cinema/publish','POST',{...mutation,gene:'cta',value:'Выберите новую идею'});
 assert.equal(tamper.status,409);assert.equal(tamper.body.code,'CINEMA_NONCE_CONFLICT');
 const baseParent=await alice('/api/branches/'+parent.id);assert.equal(baseParent.body.hook,parent.hook,'original immutable');
 const own=await alice('/api/cinema/publish','POST',{parentId:child.id,gene:'cta',value:'Посмотреть продолжение работы',nonce:'cinema-test-second-own-1',consent:true});
 assert.equal(own.status,409);assert.equal(own.body.code,'SELF_INHERITANCE');
 const locked=await bob('/api/cinema/publish','POST',{parentId:child.id,gene:'hook',value:'Бросить новые идеи в хаос',nonce:'cinema-test-second-locked-1',consent:true});
 assert.equal(locked.status,409);assert.equal(locked.body.code,'GENE_LOCKED');
 const third=await bob('/api/cinema/publish','POST',{parentId:child.id,gene:'cta',value:'Продолжить работу вместе',nonce:'cinema-test-second-bob-1',consent:true});
 assert.equal(third.status,201);assert.equal(third.body.branch.parentId,child.id);
 const returnState=await alice('/api/cinema/consequences/'+child.id);
 assert.equal(returnState.status,200);assert.equal(returnState.body.descendants,1);
 assert.equal(returnState.body.children[0].id,third.body.branch.id);
 assert.equal(returnState.body.confirmedUsefulAction,false);
 assert(!JSON.stringify(returnState.body).includes('creatorSession'),'no private session in return info');
 const outsider=await eve('/api/cinema/consequences/'+child.id);
 assert.equal(outsider.body.descendants,1,'public lineage without account');
 assert.equal((await alice('/api/stats')).body.verifiedActions,0,'fictional interaction is not conversion');
 const referral=await alice('/api/branches/'+child.id+'/invites','POST',{});
 assert.equal(referral.status,201);assert.equal(typeof referral.body.token,'string');
 const opened=await eve('/api/invites/'+referral.body.token);assert.equal(opened.status,200);assert.equal(opened.body.status,'open');
});

test('CINEMA: reject malformed content, unsafe claims, unknown parent, and invalid nonce',async()=>{
 const c=user();const root=(await c('/api/cinema/candidates')).body.branches[0];
 const common={parentId:root.id,gene:'hook',value:'Новая идея для общей команды',nonce:'cinema-invalid-case-test1',consent:true};
 for(const change of [{gene:'proof'},{value:'<img src=x onerror=alert(1)>'},{nonce:'no'},{parentId:'missing-id'},{value:'Продажи гарантированно вырастут на 99%'}]){
  const res=await c('/api/cinema/publish','POST',{...common,...change});assert.notEqual(res.status,201,JSON.stringify(change));
 }
});
