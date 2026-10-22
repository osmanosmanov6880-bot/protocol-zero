'use strict';
const {DatabaseSync,backup}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const source=process.env.DB_PATH||path.join(__dirname,'..','data','protocol-zero.sqlite');
if(!fs.existsSync(source)){console.error('База не найдена.');process.exit(1);}
const dest=process.argv[2]||path.join(__dirname,'..','backups','protocol-zero-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
fs.mkdirSync(path.dirname(dest),{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
backup(db,dest).then(async()=>{
  const check=new DatabaseSync(dest,{readOnly:true});
  const verdict=check.prepare('PRAGMA integrity_check').get();check.close();db.close();
  if(verdict.integrity_check!=='ok')throw new Error('Проверка резервной копии завершилась с ошибкой.');
  fs.chmodSync(dest,0o600);
  console.log('Резервная копия создана и проверена:',dest);
}).catch(e=>{console.error(e);process.exitCode=1;});
