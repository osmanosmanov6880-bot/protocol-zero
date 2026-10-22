'use strict';
// WAVE 13. One-way experiment closure with a frozen, hash-verifiable audit snapshot.
const crypto=require('node:crypto');
const {AppError,withTransaction,record}=require('./database');
const {ownerPlan}=require('./experiments');
const {auditExperiment}=require('./experiment-integrity');
function closure(db,id){return db.prepare('SELECT * FROM experiment_closures WHERE experiment_id=?').get(id);}
function assertNotClosed(db,id){if(closure(db,id))throw new AppError('Эксперимент завершён. Новые назначения и результаты запрещены.',409,'EXPERIMENT_CLOSED');}
function close(db,session,id,body){
  const reason=typeof body?.reason==='string'?body.reason.trim():'';
  if(reason.length<15||reason.length>500||/[<>\x00-\x1f]/.test(reason))throw new AppError('Укажите причину остановки, 15–500 символов.');
  return withTransaction(db,()=>{
    const plan=ownerPlan(db,id,session);
    assertNotClosed(db,id);
    // Stop the stream in the same transaction as the immutable snapshot.
    db.prepare("UPDATE campaign_experiments SET status='paused' WHERE id=?").run(id);
    const audit=auditExperiment(db,session,id);
    const snapshot=JSON.stringify({schema:'protocol-zero/experiment-closure/v1',experimentId:id,
      metric:plan.metric,controlBranchId:plan.control_branch,treatmentBranchId:plan.treatment_branch,
      partner:plan.platform_key||null,reason,audit,notVerified:['independent sales','causal uplift','partner-side event accuracy']});
    const digest=crypto.createHash('sha256').update(snapshot).digest('hex');
    db.prepare('INSERT INTO experiment_closures(experiment_id,reason,snapshot_json,sha256,closed_by) VALUES(?,?,?,?,?)').run(id,reason,snapshot,digest,session);
    record(db,'experiment_closed',session,plan.control_branch);
    return get(db,session,id);
  });
}
function get(db,session,id){
  ownerPlan(db,id,session);
  const r=closure(db,id);
  if(!r)throw new AppError('Эксперимент ещё не закрыт.',404,'EXPERIMENT_OPEN');
  const actual=crypto.createHash('sha256').update(r.snapshot_json).digest('hex');
  if(actual!==r.sha256)throw new AppError('Зафиксированный отчёт повреждён.',409,'CLOSURE_TAMPERED');
  return{experimentId:id,reason:r.reason,closedAt:r.closed_at,sha256:r.sha256,snapshot:JSON.parse(r.snapshot_json),
    explanation:'Хеш доказывает неизменность сохранённого JSON внутри данной базы, но не подлинность событий внешней площадки.'};
}
module.exports={close,get,closure,assertNotClosed};
