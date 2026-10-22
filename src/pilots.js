'use strict';
// WAVE 09: customer demand and offer workflow. Accepted != paid, delivered or contracted.
const {AppError,uid,withTransaction,record,enforceSessionQuota}=require('./database');
const {authorized}=require('./curation');
const {requireVisible}=require('./database');
const REQUEST_ID=/^PIL-[A-Za-z0-9_-]{13,16}$/;
const BANDS=['unknown','under_500','500_2000','2000_plus'];
function clean(v,min,max,label){
  if(typeof v!=='string')throw new AppError('Некорректное поле '+label);
  const s=v.trim().replace(/\s+/g,' ');
  if(s.length<min||s.length>max||/[<>\u0000-\u001f\u007f]/.test(s))throw new AppError('Длина поля «'+label+'»: '+min+'–'+max+' символов.');
  return s;
}
function submit(db,session,submissionId,obj){
  const objective=clean(obj?.objective,20,700,'цель'),budgetBand=obj?.budgetBand;
  if(!BANDS.includes(budgetBand))throw new AppError('Выберите допустимый диапазон бюджета.');
  return withTransaction(db,()=>{
    const sub=authorized(db,session,submissionId);
    if(sub.status!=='approved'||!sub.campaign_id)throw new AppError('Пилот возможен только для опубликованного брифа.',409,'NOT_APPROVED');
    requireVisible(db,sub.campaign_id+'-ROOT');
    enforceSessionQuota(db,session,'pilot_requested',3,'-30 days');
    const active=db.prepare("SELECT COUNT(*) AS n FROM pilot_requests WHERE submission_id=? AND status NOT IN ('withdrawn','declined')").get(submissionId).n;
    if(active>=2)throw new AppError('У кампании уже есть два активных запроса.',429,'PILOT_LIMIT');
    const id='PIL-'+uid(10);
    db.prepare(`INSERT INTO pilot_requests(id,submission_id,owner_session,objective,budget_band) VALUES(?,?,?,?,?)`).run(id,submissionId,session,objective,budgetBand);
    db.prepare(`INSERT INTO pilot_audit(pilot_id,actor,old_status,new_status,explanation) VALUES(?,'owner',NULL,'requested','Создан запрос на коммерческий пилот')`).run(id);
    record(db,'pilot_requested',session,sub.campaign_id+'-ROOT');
    return{id,status:'requested',note:'Запрос на обсуждение услуг. Это не счёт, не заказ, не оплата и не обязательство.'};
  });
}
function rowForOwner(db,id,session){
  if(!REQUEST_ID.test(id))throw new AppError('Запрос не найден.',404,'PILOT_NOT_FOUND');
  const r=db.prepare('SELECT * FROM pilot_requests WHERE id=?').get(id);
  if(!r)throw new AppError('Запрос не найден.',404,'PILOT_NOT_FOUND');
  authorized(db,session,r.submission_id);
  if(r.owner_session!==session)throw new AppError('Нет доступа к запросу.',403,'NOT_OWNER');
  return r;
}
function safe(r){return{id:r.id,submissionId:r.submission_id,status:r.status,objective:r.objective,budgetBand:r.budget_band,proposal:r.proposal,quoteEurCents:r.quote_eur_cents,createdAt:r.created_at,updatedAt:r.updated_at,paymentStatus:'not_integrated',caveat:'Согласие на обсуждение пилота не подтверждает оплату, договор или оказанную услугу.'};}
function list(db,session,submissionId){
  authorized(db,session,submissionId);
  return{pilots:db.prepare('SELECT * FROM pilot_requests WHERE submission_id=? AND owner_session=? ORDER BY created_at DESC,rowid DESC LIMIT 30').all(submissionId,session).map(safe)};
}
function ownerAction(db,session,id,action){
  if(!['accept','decline','withdraw'].includes(action))throw new AppError('Неверное действие.');
  return withTransaction(db,()=>{
    const r=rowForOwner(db,id,session);
    const next=action==='accept'?'accepted':action==='decline'?'declined':'withdrawn';
    if(action==='withdraw'&&!['requested','reviewing'].includes(r.status))throw new AppError('Этот запрос уже обработан.',409,'INVALID_STATUS');
    if(action!=='withdraw'&&r.status!=='proposal_sent')throw new AppError('Решение возможно только после получения предложения.',409,'NO_PROPOSAL');
    db.prepare('UPDATE pilot_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next,id);
    db.prepare(`INSERT INTO pilot_audit(pilot_id,actor,old_status,new_status,explanation) VALUES(?,'owner',?,?,'Изменено пользователем в своём браузере')`).run(id,r.status,next);
    record(db,'pilot_'+next,session);
    return{...safe({...r,status:next}),note:next==='accepted'?'Вы выразили заинтересованность в предложении. Оплата и юридический договор не оформлены.':'Статус обновлён.'};
  });
}
function operatorList(db){return db.prepare(`SELECT p.id,p.submission_id AS submissionId,s.brand,p.status,p.budget_band AS budgetBand,p.created_at AS createdAt
  FROM pilot_requests p JOIN brand_submissions s ON s.id=p.submission_id ORDER BY p.created_at DESC,p.rowid DESC LIMIT 150`).all();}
function operatorGet(db,id){
  if(!REQUEST_ID.test(id))throw new AppError('Запрос не найден.',404,'PILOT_NOT_FOUND');
  const r=db.prepare(`SELECT p.*,s.brand,s.title,s.contact_email AS contactEmail,s.contact_consent_at AS contactConsentAt FROM pilot_requests p
    JOIN brand_submissions s ON s.id=p.submission_id WHERE p.id=?`).get(id);
  if(!r)throw new AppError('Запрос не найден.',404,'PILOT_NOT_FOUND');
  return r;
}
function operatorAction(db,id,action,params={}){
  if(!['reviewing','proposal_sent','declined'].includes(action))throw new AppError('Неизвестная стадия.');
  return withTransaction(db,()=>{
    const r=operatorGet(db,id);
    const allowed={requested:['reviewing','proposal_sent','declined'],reviewing:['proposal_sent','declined'],proposal_sent:['declined']};
    if(!allowed[r.status]?.includes(action))throw new AppError('Недопустимый переход состояния.',409,'INVALID_STATUS');
    const explanation=clean(params.explanation||'',12,600,'основание');
    let proposal=r.proposal,quote=r.quote_eur_cents;
    if(action==='proposal_sent'){
      proposal=clean(params.proposal,30,1200,'предложение');
      if(!Number.isSafeInteger(params.quoteEurCents)||params.quoteEurCents<100||params.quoteEurCents>5000000)throw new AppError('Укажите сумму предложения в евроцентах от 100 до 5000000.');
      quote=params.quoteEurCents;
    }
    db.prepare('UPDATE pilot_requests SET status=?,proposal=?,quote_eur_cents=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(action,proposal,quote,id);
    db.prepare(`INSERT INTO pilot_audit(pilot_id,actor,old_status,new_status,explanation) VALUES(?,'operator',?,?,?)`).run(id,r.status,action,explanation);
    record(db,'pilot_'+action,null);
    return{id,status:action,quoteEurCents:quote,note:'Предложение — не платёжная операция. Платежи в приложении не подключены.'};
  });
}
module.exports={submit,list,ownerAction,operatorList,operatorGet,operatorAction,rowForOwner};
