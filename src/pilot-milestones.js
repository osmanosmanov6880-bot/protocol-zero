'use strict';
// WAVE 14. Workflow evidence of project progress, NOT evidence of payment or legal delivery.
const {AppError,uid,withTransaction,record}=require('./database');
const {rowForOwner,operatorGet}=require('./pilots');
const ID=/^MS-[A-Za-z0-9_-]{13,16}$/;
function clean(value,min,max){
  const s=typeof value==='string'?value.trim().replace(/\s+/g,' '):'';
  if(s.length<min||s.length>max||/[<>\x00-\x1f]/.test(s))throw new AppError('Некорректный текст этапа (длина или символы).');
  return s;
}
function listRows(db,pilotId){
  return db.prepare('SELECT id,title,description,status,owner_note AS ownerNote,created_at AS createdAt,submitted_at AS submittedAt,reviewed_at AS reviewedAt FROM pilot_milestones WHERE pilot_id=? ORDER BY rowid ASC LIMIT 25').all(pilotId);
}
function ownerList(db,session,pilotId){
  const pilot=rowForOwner(db,pilotId,session);
  return{pilotId,status:pilot.status,milestones:listRows(db,pilotId),note:'Операционные этапы согласования. Подтверждение просмотра не означает оплату, юридическую приёмку или проверенную рекламную эффективность.'};
}
function operatorList(db,pilotId){
  const pilot=operatorGet(db,pilotId);
  return{pilotId,status:pilot.status,milestones:listRows(db,pilotId)};
}
function create(db,pilotId,title,description){
  const t=clean(title,5,110),d=clean(description,15,800);
  return withTransaction(db,()=>{
    const p=operatorGet(db,pilotId);
    if(p.status!=='accepted')throw new AppError('Этапы доступны после заинтересованности клиента в предложении.',409,'PILOT_NOT_ACCEPTED');
    if(db.prepare('SELECT COUNT(*) AS n FROM pilot_milestones WHERE pilot_id=?').get(pilotId).n>=12)throw new AppError('Не более 12 этапов на пилот.',429,'MILESTONE_LIMIT');
    const id='MS-'+uid(10);
    db.prepare('INSERT INTO pilot_milestones(id,pilot_id,title,description) VALUES(?,?,?,?)').run(id,pilotId,t,d);
    db.prepare("INSERT INTO pilot_milestone_log(milestone_id,actor,from_status,to_status,detail) VALUES(?,'operator',NULL,'planned',?)").run(id,'Этап создан оператором');
    record(db,'pilot_milestone_created',null);
    return{id,status:'planned'};
  });
}
function submit(db,pilotId,id,detail){
  const explanation=clean(detail,10,500);
  return withTransaction(db,()=>{
    const p=operatorGet(db,pilotId);
    if(p.status!=='accepted')throw new AppError('Пилот не в согласованной стадии.',409,'PILOT_NOT_ACCEPTED');
    const row=db.prepare('SELECT status FROM pilot_milestones WHERE id=? AND pilot_id=?').get(id,pilotId);
    if(!row)throw new AppError('Этап не найден.',404,'MILESTONE_NOT_FOUND');
    if(!['planned','changes_requested'].includes(row.status))throw new AppError('Недопустимый переход этапа.',409,'MILESTONE_STATE');
    db.prepare("UPDATE pilot_milestones SET status='submitted',submitted_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
    db.prepare("INSERT INTO pilot_milestone_log(milestone_id,actor,from_status,to_status,detail) VALUES(?,'operator',?,'submitted',?)").run(id,row.status,explanation);
    record(db,'pilot_milestone_submitted',null);
    return{id,status:'submitted'};
  });
}
function ownerReview(db,session,pilotId,id,body){
  if(!ID.test(id))throw new AppError('Этап не найден.',404,'MILESTONE_NOT_FOUND');
  if(!['acknowledged','changes_requested'].includes(body?.decision))throw new AppError('Выберите ознакомление или запрос изменений.');
  const note=clean(body?.note,10,600);
  return withTransaction(db,()=>{
    rowForOwner(db,pilotId,session);
    const row=db.prepare('SELECT status FROM pilot_milestones WHERE id=? AND pilot_id=?').get(id,pilotId);
    if(!row)throw new AppError('Этап не найден.',404,'MILESTONE_NOT_FOUND');
    if(row.status!=='submitted')throw new AppError('Этап ещё не отправлен или уже рассмотрен.',409,'MILESTONE_STATE');
    db.prepare('UPDATE pilot_milestones SET status=?,owner_note=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(body.decision,note,id);
    db.prepare("INSERT INTO pilot_milestone_log(milestone_id,actor,from_status,to_status,detail) VALUES(?,'owner','submitted',?,?)").run(id,body.decision,note);
    record(db,'pilot_milestone_'+body.decision,session);
    return{id,status:body.decision,note:'Зафиксирована реакция клиента в приложении, но не факт приёмки услуг по договору.'};
  });
}
module.exports={create,submit,ownerReview,ownerList,operatorList};
