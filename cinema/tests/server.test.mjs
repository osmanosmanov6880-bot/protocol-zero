import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('Static server serves full movie, prototype, JS, art and health check',async()=>{
 const port=21000+process.pid%17000;
 const child=spawn(process.execPath,['tools/server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:'ignore'});
 try{
  let ready=false;
  for(let n=0;n<30;n++){
   if(child.exitCode!==null)break;
   try{const res=await fetch(`http://127.0.0.1:${port}/healthz`);if(res.ok){ready=true;break;}}catch{}
   await pause(75);
  }
  assert.equal(ready,true,'server started');
  for(const [url,type] of [['/','text/html'],['/prototype/','text/html'],['/src/app.mjs','text/javascript'],['/assets/keyframes/city_dawn-desktop.webp','image/webp']]){
    const res=await fetch(`http://127.0.0.1:${port}${url}`);
    assert.equal(res.status,200,url);
    assert.ok(res.headers.get('content-type').includes(type),url);
    assert.ok((await res.arrayBuffer()).byteLength>100,url);
  }
  const missing=await fetch(`http://127.0.0.1:${port}/missing-abc`);
  assert.equal(missing.status,404);
 }finally{child.kill('SIGTERM');}
},{timeout:10000});
