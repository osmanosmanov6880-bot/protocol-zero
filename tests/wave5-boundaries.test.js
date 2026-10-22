'use strict';
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-wave5-http-'));
process.env.DB_PATH=path.join(dir,'app.sqlite');
const {server,db}=require('../src/server');let origin;
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('WAVE 5: cross-origin and cross-site state-changing requests are rejected',async()=>{
  const req={method:'POST',headers:{'content-type':'application/json','Origin':'https://bad-site.example'},body:JSON.stringify({hook:'Короткая формулировка',cta:'Посмотреть товар'})};
  const response=await fetch(origin+'/api/preflight',req);
  assert.equal(response.status,403);assert.equal((await response.json()).code,'CROSS_ORIGIN');
  const spoof=await fetch(origin+'/api/preflight',{method:'POST',headers:{'content-type':'application/json','sec-fetch-site':'cross-site'},body:JSON.stringify({hook:'Безопасный слоган',cta:'Подробнее'})});
  assert.equal(spoof.status,403);
});
test('WAVE 5: errors are bounded and security headers remain active',async()=>{
  const large=await fetch(origin+'/api/preflight',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hook:'x'.repeat(15000),cta:'Открыть сейчас'})});
  assert.equal(large.status,413);
  const ready=await fetch(origin+'/api/ready');assert.equal(ready.status,200);
  const headers=ready.headers;
  assert.equal(headers.get('x-content-type-options'),'nosniff');
  assert.equal(headers.get('x-frame-options'),'DENY');
  assert.match(headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
