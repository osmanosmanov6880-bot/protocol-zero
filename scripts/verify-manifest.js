'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const file=path.join(root,'RELEASE_MANIFEST_SHA256.txt');
const lines=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean);
let errors=0;
for(const line of lines){
  const match=line.match(/^([a-f0-9]{64})  (.+)$/);
  if(!match){console.error('Некорректная строка манифеста:',line);errors++;continue;}
  const rel=match[2];
  if(rel.startsWith('/')||rel.split('/').includes('..')){console.error('Опасный путь:',rel);errors++;continue;}
  const actual=path.resolve(root,rel);
  if(!actual.startsWith(root+path.sep)){console.error('Путь за пределами проекта:',rel);errors++;continue;}
  if(!fs.existsSync(actual)){console.error('Файл отсутствует:',rel);errors++;continue;}
  const hash=crypto.createHash('sha256').update(fs.readFileSync(actual)).digest('hex');
  if(hash!==match[1]){console.error('Контрольная сумма не совпала:',rel);errors++;}
}
if(errors){console.error('Проверка не пройдена:',errors,'ошибок');process.exitCode=1;}
else console.log('PROTOCOL ZERO: проверены',lines.length,'файлов, SHA-256 совпадают.');
