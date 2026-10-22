'use strict';
const {spawn}=require('node:child_process');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.join(__dirname,'..');
const secret=crypto.randomBytes(48).toString('hex');
const env={...process.env,HOST:'127.0.0.1',PORT:'8787',PZ_SANDBOX_PORT:'8790',PZ_BRIDGE_URL:'http://127.0.0.1:8787',PZ_PLATFORMS_FILE:'config/platforms.demo.json',PZ_DEMO_PARTNER_SECRET:secret,NODE_ENV:'development'};
const children=[];
for(const name of ['src/server.js','examples/partner-sandbox.js']){
 const child=spawn(process.execPath,[name],{cwd:root,env,stdio:'inherit'});
 children.push(child);
 child.on('error',err=>console.error(name,err.message));
 child.on('exit',code=>{if(!shuttingDown&&code!==0){console.error(name,'завершился с кодом',code);shutdown(1);}});
}
console.log('\nPROTOCOL ZERO: http://127.0.0.1:8787');
console.log('Демо-партнёр: http://127.0.0.1:8790 (только после передачи из PROTOCOL ZERO)');
console.log('НЕТ реальных платежей или подключённых рекламных компаний. Ctrl+C для остановки.\n');
let shuttingDown=false;
function shutdown(code=0){if(shuttingDown)return;shuttingDown=true;for(const p of children)if(p.exitCode===null)p.kill('SIGTERM');setTimeout(()=>process.exit(code),250).unref();}
process.on('SIGINT',()=>shutdown(0));process.on('SIGTERM',()=>shutdown(0));
