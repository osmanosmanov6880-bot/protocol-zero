'use strict';
// Independent executable smoke check on a fresh temporary SQLite database.
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const net=require('node:net');const {spawn}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-smoke-'));
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
(async()=>{
  const port=await freePort();let child;
  try{
    child=spawn(process.execPath,['src/server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:String(port),DB_PATH:path.join(dir,'smoke.sqlite'),PZ_PLATFORMS_FILE:''},stdio:'ignore'});
    const base='http://127.0.0.1:'+port;
    let ready=null;
    for(let i=0;i<60;i++){
      if(child.exitCode!==null)throw Error('Сервер завершился до проверки.');
      try{ready=await fetch(base+'/api/ready');if(ready.ok)break;}catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    if(!ready?.ok)throw Error('База не прошла readiness check.');
    const health=await(await fetch(base+'/api/health')).json();
    if(!health.ok||health.version!=='3.4.0')throw Error('Health/version mismatch.');
    const film=await fetch(base+'/cinema/');if(film.status!==200||!(await film.text()).includes('PROTOCOL ZERO'))throw Error('Cinema route unavailable.');
    const filmScript=await fetch(base+'/cinema/src/app.mjs');if(filmScript.status!==200)throw Error('Cinema modules unavailable.');
    const root=await fetch(base+'/');
    if(root.status!==200||!root.headers.get('content-security-policy')?.includes("script-src 'self'"))throw Error('Static page or CSP missing.');
    const boot=await fetch(base+'/api/bootstrap');const payload=await boot.json();
    if(!boot.ok||payload.roots.length<3||!boot.headers.get('set-cookie')?.includes('HttpOnly'))throw Error('Bootstrap/session invalid.');
    const preflight=await fetch(base+'/api/preflight',{method:'POST',headers:{'content-type':'application/json','cookie':boot.headers.get('set-cookie').split(';')[0]},body:JSON.stringify({hook:'Экономия 90% бюджета!',cta:'Купить сегодня'})});
    if(!preflight.ok||(await preflight.json()).status!=='needs_human_review')throw Error('Creative preflight regression.');
    for(const route of ['/submit','/bridge','/lab/BRF-0123456789abcdef','/insights/BRF-0123456789abcdef','/reviews/BRF-0123456789abcdef','/pilots/BRF-0123456789abcdef','/command/BRF-0123456789abcdef','/delivery/BRF-0123456789abcdef','/team/BRF-0123456789abcdef','/team/join/'+'a'.repeat(43),'/review/'+'a'.repeat(43)]){
      const response=await fetch(base+route);if(response.status!==200)throw Error('SPA route '+route+' unavailable.');
    }
    console.log('PROTOCOL ZERO v3.4.0 smoke: readiness, CSP, UI routes, sessions, bootstrap, creative preflight — OK');
  }finally{
    if(child){child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,1200).unref();});}
    fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(err=>{console.error('SMOKE FAILED:',err.message);process.exitCode=1;});
