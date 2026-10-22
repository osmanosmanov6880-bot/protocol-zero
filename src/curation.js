'use strict';
// Wave 2: brand-owner private editorial curation. These are human labels, never performance ranks.
const {AppError,withTransaction,enforceSessionQuota,record,requireVisible}=require('./database');
const {operatorView}=require('./submissions');
const STATUSES=['candidate','shortlisted','discarded'];
function authorized(db,sessionId,submissionId){
  const item=operatorView(db,submissionId);
  if(item.owner_session!==sessionId)throw new AppError('Чужой кабинет рекламодателя закрыт.',403,'NOT_OWNER');
  if(item.status!=='approved'||!item.campaign_id)throw new AppError('Кампания ещё не опубликована.',409,'NOT_APPROVED');
  requireVisible(db,item.campaign_id+'-ROOT');
  return item;
}
function reviewedVariants(db,sessionId,submissionId){
  const item=authorized(db,sessionId,submissionId);
  const rows=db.prepare(`SELECT r.branch_id AS branchId,r.status,r.note,r.updated_at AS updatedAt
    FROM brand_variant_reviews r WHERE r.submission_id=? ORDER BY r.updated_at DESC,r.rowid DESC LIMIT 500`).all(submissionId);
  return {campaignId:item.campaign_id,reviews:rows.filter(r=>{
    const b=db.prepare('SELECT campaign_id FROM branches WHERE id=?').get(r.branchId);
    try{requireVisible(db,r.branchId);return b?.campaign_id===item.campaign_id;}catch{return false;}
  }),meaning:'Это только приватные редакционные статусы рекламодателя, а не тест эффективности.'};
}
function setReview(db,sessionId,submissionId,payload){
  if(!payload||typeof payload!=='object')throw new AppError('Ожидается редакционный выбор.');
  const {branchId,status}=payload;
  if(typeof branchId!=='string'||!STATUSES.includes(status)||typeof payload.note!=='string')throw new AppError('Укажите ветвь, статус и заметку.');
  const note=payload.note.trim();
  if(note.length>700||/[\u0000-\u0008\u000b-\u001f]/.test(note))throw new AppError('Заметка не должна превышать 700 символов.');
  return withTransaction(db,()=>{
    const sub=authorized(db,sessionId,submissionId);
    const b=requireVisible(db,branchId);
    if(b.campaignId!==sub.campaign_id||b.generation<1)throw new AppError('Это не публичный вариант вашей кампании.',403,'WRONG_CAMPAIGN');
    enforceSessionQuota(db,sessionId,'brand_variant_reviewed',100,'-1 hour');
    db.prepare(`INSERT INTO brand_variant_reviews(submission_id,branch_id,status,note)
      VALUES(?,?,?,?) ON CONFLICT(submission_id,branch_id) DO UPDATE SET
      status=excluded.status,note=excluded.note,updated_at=CURRENT_TIMESTAMP`).run(submissionId,branchId,status,note);
    record(db,'brand_variant_reviewed',sessionId,branchId);
    return {branchId,status,note,meaning:'Редакционное мнение без заявлений об эффективности.'};
  });
}
module.exports={authorized,reviewedVariants,setReview,STATUSES};
