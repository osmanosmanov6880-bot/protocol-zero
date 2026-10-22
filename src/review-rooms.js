'use strict';
// WAVE 06: expiring customer review links. Tokens are stored hashed, not recoverable.
// WAVE 07: private, auditable client feedback decisions, never public performance data.
const crypto=require('node:crypto');
const {AppError,uid,withTransaction,requireVisible,record,enforceSessionQuota}=require('./database');
const {authorized}=require('./curation');
const ROOM_ID=/^ROOM-[A-Za-z0-9_-]{13,16}$/;
const FEEDBACK_ID=/^FDB-[A-Za-z0-9_-]{13,16}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const hash=t=>crypto.createHash('sha256').update('pz-review-v1:'+t).digest('hex');
function ownerSubmission(db,owner,submissionId){
  const s=authorized(db,owner,submissionId);
  if(s.status!=='approved'||!s.campaign_id)throw new AppError('Нужна опубликованная кампания.',409,'NOT_APPROVED');
  requireVisible(db,s.campaign_id+'-ROOT');
  return s;
}
function text(value,min,max,field){
  if(typeof value!=='string')throw new AppError('Заполните поле: '+field);
  const v=value.trim().replace(/\s+/g,' ');
  if(v.length<min||v.length>max||/[<>\u0000-\u001f\u007f]/.test(v))throw new AppError('Поле «'+field+'» должно содержать '+min+'–'+max+' символов без специальных символов.');
  return v;
}
function createRoom(db,owner,submissionId,request){
  const ids=request?.branchIds;
  if(!Array.isArray(ids)||ids.length<1||ids.length>6||new Set(ids).size!==ids.length)throw new AppError('Выберите от 1 до 6 разных вариантов для согласования.');
  const days=request.expiresInDays;
  if(![1,7,30].includes(days))throw new AppError('Срок доступа: 1, 7 или 30 дней.');
  return withTransaction(db,()=>{
    const sub=ownerSubmission(db,owner,submissionId);
    enforceSessionQuota(db,owner,'review_room_created',8,'-1 day');
    const active=db.prepare('SELECT COUNT(*) AS n FROM review_rooms WHERE submission_id=? AND revoked_at IS NULL AND expires_at>?').get(submissionId,new Date().toISOString()).n;
    if(active>=8)throw new AppError('Лимит активных комнат для этой кампании.',429,'ROOM_LIMIT');
    const variants=ids.map(id=>{
      if(typeof id!=='string')throw new AppError('Неверная версия.');
      const b=requireVisible(db,id);
      if(b.campaignId!==sub.campaign_id)throw new AppError('Чужую кампанию нельзя передать на согласование.',403,'WRONG_CAMPAIGN');
      return{branchId:b.id,generation:b.generation,hook:b.hook,cta:b.cta,tone:b.tone,changedGene:b.changedGene};
    });
    const id='ROOM-'+uid(10),token=uid(32),expiresAt=new Date(Date.now()+days*86400000).toISOString();
    db.prepare(`INSERT INTO review_rooms(id,submission_id,owner_session,token_hash,snapshot_json,expires_at) VALUES(?,?,?,?,?,?)`)
      .run(id,submissionId,owner,hash(token),JSON.stringify({campaignId:sub.campaign_id,brand:sub.brand,variants}),expiresAt);
    record(db,'review_room_created',owner,sub.campaign_id+'-ROOT');
    return{id,token,expiresAt,path:'/review/'+token,note:'Секретная ссылка показывается только один раз. В ней нет личных рабочих копий.'};
  });
}
function findRoom(db,token){
  if(typeof token!=='string'||!TOKEN.test(token))throw new AppError('Ссылка не найдена.',404,'REVIEW_NOT_FOUND');
  const r=db.prepare('SELECT * FROM review_rooms WHERE token_hash=?').get(hash(token));
  if(!r)throw new AppError('Ссылка не найдена.',404,'REVIEW_NOT_FOUND');
  if(r.revoked_at||Date.parse(r.expires_at)<=Date.now())throw new AppError('Срок или доступ к этой комнате завершён.',410,'REVIEW_CLOSED');
  const payload=JSON.parse(r.snapshot_json);
  for(const v of payload.variants)requireVisible(db,v.branchId);
  return{room:r,payload};
}
function publicRoom(db,token,session){
  const {room,payload}=findRoom(db,token);
  const mine=db.prepare(`SELECT id,branch_id AS branchId,score,comment,created_at AS createdAt FROM review_feedback WHERE room_id=? AND visitor_session=? ORDER BY created_at DESC`).all(room.id,session);
  return{roomId:room.id,brand:payload.brand,variants:payload.variants,expiresAt:room.expires_at,myFeedback:mine,privacy:'Ссылка предоставляет доступ только к выбранным публичным вариантам. Ваш отзыв виден автору кампании, но не другим приглашённым. Эффективность рекламы не измеряется.'};
}
function sendFeedback(db,token,session,request){
  const branchId=request?.branchId;
  const score=request?.score;
  if(!Number.isInteger(score)||score<1||score>5)throw new AppError('Оценка должна быть числом от 1 до 5.');
  const comment=text(request.comment,10,600,'комментарий');
  return withTransaction(db,()=>{
    const{room,payload}=findRoom(db,token);
    if(room.owner_session===session)throw new AppError('Автор кампании не оценивает собственные варианты через гостевую ссылку.',403,'SELF_REVIEW');
    if(!payload.variants.some(v=>v.branchId===branchId))throw new AppError('Выберите предложенный вариант.',403,'WRONG_VARIANT');
    enforceSessionQuota(db,session,'review_feedback_sent',12,'-1 day');
    if(db.prepare('SELECT id FROM review_feedback WHERE room_id=? AND branch_id=? AND visitor_session=?').get(room.id,branchId,session))throw new AppError('Вы уже оценили этот вариант.',409,'ALREADY_REVIEWED');
    const id='FDB-'+uid(10);
    db.prepare(`INSERT INTO review_feedback(id,room_id,branch_id,visitor_session,score,comment) VALUES(?,?,?,?,?,?)`).run(id,room.id,branchId,session,score,comment);
    record(db,'review_feedback_sent',session,branchId);
    return{id,ok:true,message:'Отзыв сохранён приватно для рекламодателя.'};
  });
}
function ownerRoom(db,session,submissionId,roomId){
  ownerSubmission(db,session,submissionId);
  if(!ROOM_ID.test(roomId))throw new AppError('Комната не найдена.',404,'ROOM_NOT_FOUND');
  const r=db.prepare('SELECT * FROM review_rooms WHERE id=? AND submission_id=? AND owner_session=?').get(roomId,submissionId,session);
  if(!r)throw new AppError('Комната не найдена.',404,'ROOM_NOT_FOUND');
  return r;
}
function listRooms(db,owner,submissionId){
  ownerSubmission(db,owner,submissionId);
  const rooms=db.prepare(`SELECT r.id,r.created_at AS createdAt,r.expires_at AS expiresAt,r.revoked_at AS revokedAt,
    COUNT(f.id) AS feedbackCount
    FROM review_rooms r LEFT JOIN review_feedback f ON f.room_id=r.id
    WHERE r.submission_id=? AND r.owner_session=? GROUP BY r.id ORDER BY r.created_at DESC,r.rowid DESC LIMIT 40`).all(submissionId,owner);
  return{rooms:rooms.map(r=>({...r,active:!r.revokedAt&&Date.parse(r.expiresAt)>Date.now()}))};
}
function roomResults(db,owner,submissionId,roomId){
  const r=ownerRoom(db,owner,submissionId,roomId),snapshot=JSON.parse(r.snapshot_json);
  const feedback=db.prepare(`SELECT id,branch_id AS branchId,score,comment,decision,owner_note AS ownerNote,
    created_at AS createdAt,reviewed_at AS reviewedAt FROM review_feedback WHERE room_id=? ORDER BY created_at DESC,id DESC LIMIT 300`).all(roomId);
  return{roomId,brand:snapshot.brand,variants:snapshot.variants,feedback,expiresAt:r.expires_at,revokedAt:r.revoked_at,caveat:'Оценка приглашённого клиента — субъективное мнение, не показатель реальной конверсии. Имя респондента не собирается.'};
}
function decide(db,owner,submissionId,roomId,feedbackId,body){
  if(!FEEDBACK_ID.test(feedbackId))throw new AppError('Отзыв не найден.',404,'FEEDBACK_NOT_FOUND');
  if(!['new','considered','rejected'].includes(body?.decision))throw new AppError('Неизвестное решение.');
  const note=text(body.note||'',0,700,'заметка');
  return withTransaction(db,()=>{
    ownerRoom(db,owner,submissionId,roomId);
    const existing=db.prepare('SELECT id FROM review_feedback WHERE id=? AND room_id=?').get(feedbackId,roomId);
    if(!existing)throw new AppError('Отзыв не найден.',404,'FEEDBACK_NOT_FOUND');
    db.prepare(`UPDATE review_feedback SET decision=?,owner_note=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).run(body.decision,note,feedbackId);
    db.prepare(`INSERT INTO review_decision_log(feedback_id,decision) VALUES(?,?)`).run(feedbackId,body.decision);
    record(db,'review_feedback_decided',owner,null);
    return{ok:true,decision:body.decision};
  });
}
function revokeRoom(db,owner,submissionId,roomId){
  return withTransaction(db,()=>{
    ownerRoom(db,owner,submissionId,roomId);
    db.prepare('UPDATE review_rooms SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE id=?').run(roomId);
    record(db,'review_room_revoked',owner);
    return{ok:true,revoked:true};
  });
}
module.exports={createRoom,publicRoom,sendFeedback,listRooms,roomResults,decide,revokeRoom};
