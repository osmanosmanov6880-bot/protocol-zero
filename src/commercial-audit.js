'use strict';
const crypto=require('node:crypto');
const {uid,AppError}=require('./database');
function digest(prev,id,action,subject){return crypto.createHash('sha256').update(JSON.stringify([prev,id,action,subject])).digest('hex');}
function append(db,submissionId,action,subjectId){
  const prev=db.prepare('SELECT sha256 FROM commercial_audit WHERE submission_id=? ORDER BY rowid DESC LIMIT 1').get(submissionId)?.sha256||'0'.repeat(64);
  const id='AUD-'+uid(10),sha256=digest(prev,id,action,subjectId);
  db.prepare('INSERT INTO commercial_audit(id,submission_id,action,subject_id,previous_hash,sha256) VALUES(?,?,?,?,?,?)')
    .run(id,submissionId,action,subjectId,prev,sha256);
  return sha256;
}
function verify(db,submissionId){
  const rows=db.prepare('SELECT id,action,subject_id AS subjectId,previous_hash AS previousHash,sha256,created_at AS createdAt FROM commercial_audit WHERE submission_id=? ORDER BY rowid ASC').all(submissionId);
  let prev='0'.repeat(64);
  for(const r of rows){
    if(r.previousHash!==prev||digest(prev,r.id,r.action,r.subjectId)!==r.sha256)
      return{ok:false,events:rows.length,brokenAt:r.id,algorithm:'sha256-linked-records'};
    prev=r.sha256;
  }
  return{ok:true,events:rows.length,head:prev,algorithm:'sha256-linked-records',caveat:'Связанные хеши обнаруживают случайные изменения, но не защищают от администратора, способного переписать базу.'};
}
function ownerAudit(db,session,submissionId){
  require('./curation').authorized(db,session,submissionId);
  return{...verify(db,submissionId),entries:db.prepare('SELECT action,subject_id AS subjectId,sha256,created_at AS createdAt FROM commercial_audit WHERE submission_id=? ORDER BY rowid DESC LIMIT 40').all(submissionId)};
}
module.exports={append,verify,ownerAudit};
