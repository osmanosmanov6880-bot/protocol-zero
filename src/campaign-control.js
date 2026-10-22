'use strict';
// WAVE 11. Pause new participation, preserve public ancestry and archived creativity.
const {AppError,withTransaction,record,requireVisible}=require('./database');
const {authorized}=require('./curation');
function statusFor(db,campaignId){
  const r=db.prepare('SELECT status,reason,updated_at AS updatedAt FROM campaign_controls WHERE campaign_id=?').get(campaignId);
  return r||{status:'open',reason:'',updatedAt:null};
}
function assertOpen(db,campaignId){
  if(statusFor(db,campaignId).status==='paused')throw new AppError('Кампания временно закрыта для новых мутаций и приглашений. Существующая история сохранена.',409,'CAMPAIGN_PAUSED');
}
function settings(db,session,submissionId){
  const s=authorized(db,session,submissionId);
  const log=db.prepare('SELECT previous,new_status AS status,reason,changed_at AS changedAt FROM campaign_control_log WHERE campaign_id=? ORDER BY id DESC LIMIT 20').all(s.campaign_id);
  return {submissionId,campaignId:s.campaign_id,...statusFor(db,s.campaign_id),log};
}
function update(db,session,submissionId,body){
  if(!['paused','open'].includes(body?.status))throw new AppError('Выберите состояние «open» или «paused».');
  const reason=String(body?.reason||'').trim();
  if(reason.length<10||reason.length>240||/[<>\x00-\x1f]/.test(reason))throw new AppError('Укажите причину 10–240 символов.');
  return withTransaction(db,()=>{
    const s=authorized(db,session,submissionId);
    const previous=statusFor(db,s.campaign_id);
    if(previous.status===body.status)throw new AppError('Кампания уже в выбранном состоянии.',409,'ALREADY_SET');
    db.prepare(`INSERT INTO campaign_controls(campaign_id,status,reason,updated_by,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(campaign_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
      .run(s.campaign_id,body.status,reason,session);
    db.prepare('INSERT INTO campaign_control_log(campaign_id,previous,new_status,reason) VALUES(?,?,?,?)').run(s.campaign_id,previous.status,body.status,reason);
    record(db,'campaign_'+body.status,session,s.campaign_id+'-ROOT');
    return settings(db,session,submissionId);
  });
}
// Operator console recovery for orphaned anonymous owners. Deliberately no HTTP route.
function operatorUpdate(db,submissionId,status,reason){
  const sub=require('./submissions').operatorView(db,submissionId);
  if(sub.status!=='approved'||!sub.campaign_id)throw new AppError('Нужна одобренная кампания.',409,'NOT_APPROVED');
  if(!['open','paused'].includes(status))throw new AppError('Неверный статус.');
  const why=String(reason||'').trim();
  if(why.length<10||why.length>240||/[<>\x00-\x1f]/.test(why))throw new AppError('Основание 10–240 символов.');
  return withTransaction(db,()=>{
    const prev=statusFor(db,sub.campaign_id);
    if(prev.status===status)throw new AppError('Состояние уже установлено.',409,'ALREADY_SET');
    db.prepare(`INSERT INTO campaign_controls(campaign_id,status,reason,updated_by,updated_at) VALUES(?,?,?,NULL,CURRENT_TIMESTAMP)
      ON CONFLICT(campaign_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,updated_by=NULL,updated_at=CURRENT_TIMESTAMP`).run(sub.campaign_id,status,why);
    db.prepare('INSERT INTO campaign_control_log(campaign_id,previous,new_status,reason) VALUES(?,?,?,?)').run(sub.campaign_id,prev.status,status,'ОПЕРАТОР: '+why);
    record(db,'campaign_operator_'+status,null,sub.campaign_id+'-ROOT','operator');
    return {campaignId:sub.campaign_id,previous:prev.status,status,actor:'operator'};
  });
}
module.exports={statusFor,assertOpen,settings,update,operatorUpdate};
