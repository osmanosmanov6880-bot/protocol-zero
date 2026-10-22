'use strict';
// Wave 3: immutable creative variants, partner-authenticated allocation and measured outcomes.
// No browser self-reports can become A/B conversions. Results are descriptive, not causal claims.
const crypto=require('node:crypto');
const {AppError,uid,withTransaction,requireVisible,record,enforceSessionQuota}=require('./database');
const {authorized}=require('./curation');
const {findPlatform}=require('./bridge');
const METRICS=['lead','signup','purchase'];
const MAX_PLANS=8;
const tokenPattern=/^[A-Za-z0-9_-]{16,128}$/;
const eventPattern=/^[A-Za-z0-9_.:-]{10,100}$/;
function snapshot(branch){return {branchId:branch.id,brand:branch.brand,campaignId:branch.campaignId,generation:branch.generation,headline:branch.hook,tone:branch.tone,cta:branch.cta,audience:branch.audience,objective:branch.promise,evidence:branch.evidence,visualGuidance:branch.visual,createdAt:branch.createdAt};}
function requirePlan(db,id){
  if(typeof id!=='string'||!/^EXP-[A-Za-z0-9_-]{16,22}$/.test(id))throw new AppError('Эксперимент не найден.',404,'EXPERIMENT_NOT_FOUND');
  const row=db.prepare('SELECT * FROM campaign_experiments WHERE id=?').get(id);
  if(!row)throw new AppError('Эксперимент не найден.',404,'EXPERIMENT_NOT_FOUND');
  return row;
}
function visibility(db,plan){requireVisible(db,plan.control_branch);requireVisible(db,plan.treatment_branch);}
function ownerPlan(db,id,sessionId){const row=requirePlan(db,id);authorized(db,sessionId,row.submission_id);visibility(db,row);return row;}
function createPlan(db,platforms,sessionId,submissionId,payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new AppError('Укажите параметры эксперимента.');
  if(!METRICS.includes(payload.metric))throw new AppError('Выберите единственную основную метрику эксперимента.');
  if(typeof payload.hypothesis!=='string'||payload.hypothesis.trim().length<15||payload.hypothesis.length>400)throw new AppError('Опишите проверяемую гипотезу (15–400 символов).');
  if(/[<>\u0000-\u001f]/.test(payload.hypothesis))throw new AppError('Недопустимые символы в гипотезе.');
  if(typeof payload.controlBranchId!=='string'||typeof payload.treatmentBranchId!=='string')throw new AppError('Выберите два публичных рекламных варианта.');
  if(payload.controlBranchId===payload.treatmentBranchId)throw new AppError('Контроль и вариант должны отличаться.');
  // Plans may be created without a connector; such plans stay draft and cannot collect outcomes.
  let platform=null;
  if(payload.platformKey){
    platform=findPlatform(platforms,payload.platformKey);
    if(platform.mode!=='live'||!platform.secret)throw new AppError('Для фактического A/B требуется подключённая live-платформа с секретом.',409,'LIVE_PARTNER_REQUIRED');
  }
  return withTransaction(db,()=>{
    const sub=authorized(db,sessionId,submissionId);
    const a=requireVisible(db,payload.controlBranchId),b=requireVisible(db,payload.treatmentBranchId);
    if(a.campaignId!==sub.campaign_id||b.campaignId!==sub.campaign_id)throw new AppError('Оба варианта должны принадлежать вашей кампании.',403,'WRONG_CAMPAIGN');
    if(db.prepare('SELECT COUNT(*) AS n FROM campaign_experiments WHERE submission_id=?').get(submissionId).n>=MAX_PLANS)throw new AppError('В MVP допускается не более восьми планов на кампанию.',429,'PLAN_LIMIT');
    enforceSessionQuota(db,sessionId,'experiment_planned',12,'-1 day');
    const id='EXP-'+uid(12),mode=platform?'ready':'draft',hypothesis=payload.hypothesis.trim();
    db.prepare(`INSERT INTO campaign_experiments(id,submission_id,campaign_id,platform_key,metric,hypothesis,control_branch,treatment_branch,
      control_snapshot,treatment_snapshot,status,owner_session) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,submissionId,sub.campaign_id,platform?.key||'',payload.metric,hypothesis,a.id,b.id,JSON.stringify(snapshot(a)),JSON.stringify(snapshot(b)),mode,sessionId);
    record(db,'experiment_planned',sessionId,a.id);
    return {id,status:mode,platformKey:platform?.key||null,metric:payload.metric,message:mode==='draft'?'План создан; реальная платформа не подключена.':'Готово к назначению участников подключённой платформой.'};
  });
}
function planStats(db,id){
  const counts=db.prepare(`SELECT arm,COUNT(*) AS assignments,
    SUM(CASE WHEN impressed=1 THEN 1 ELSE 0 END) AS impressions,
    SUM(CASE WHEN converted=1 THEN 1 ELSE 0 END) AS goals
    FROM experiment_assignments WHERE experiment_id=? GROUP BY arm`).all(id);
  const byArm={A:{assignments:0,impressions:0,goals:0,rate:null},B:{assignments:0,impressions:0,goals:0,rate:null}};
  for(const r of counts){if(byArm[r.arm])byArm[r.arm]={...r,rate:r.impressions?Math.round(r.goals/r.impressions*10000)/100:null};}
  return byArm;
}
function publicPlan(db,p){const closure=db.prepare('SELECT closed_at AS closedAt,sha256 FROM experiment_closures WHERE experiment_id=?').get(p.id);return{closed:!!closure,closedAt:closure?.closedAt||null,closureSha256:closure?.sha256||null,id:p.id,submissionId:p.submission_id,platformKey:p.platform_key||null,metric:p.metric,hypothesis:p.hypothesis,controlBranchId:p.control_branch,treatmentBranchId:p.treatment_branch,status:p.status,createdAt:p.created_at,arms:planStats(db,p.id),caveat:'Назначение не равно показу; подписанный показ не равен продаже. Результаты описательные; значимость и рандомизация у партнёра требуют отдельного аудита.'};}
function listPlans(db,sessionId,submissionId){
  const sub=authorized(db,sessionId,submissionId);
  return{plans:db.prepare('SELECT * FROM campaign_experiments WHERE submission_id=? ORDER BY created_at DESC,rowid DESC').all(submissionId).filter(p=>{
    try{visibility(db,p);return p.campaign_id===sub.campaign_id;}catch{return false;}
  }).map(p=>publicPlan(db,p)),note:'A/B-планы принадлежат рекламодателю. Неподключённые планы не могут собирать реальные метрики.'};
}
function getPlan(db,sessionId,id){return publicPlan(db,ownerPlan(db,id,sessionId));}
function kit(db,sessionId,id){
  const p=ownerPlan(db,id,sessionId);
  return {...publicPlan(db,p),format:'protocol-zero/experiment-kit/v1',creative:{A:JSON.parse(p.control_snapshot),B:JSON.parse(p.treatment_snapshot)},testProtocol:{assignment:'Сервер назначает A/B детерминированно по HMAC от идентификатора участника партнёра.',exposure:'Показ засчитывается только по подписанному событию live-партнёра.',goal:'Целевое действие засчитывается только после подписанного показа того же участника.',metric:p.metric,notMeasured:['incremental sales','brand lift','causal uplift']}};
}
function pausePlan(db,sessionId,id){
  return withTransaction(db,()=>{
    const p=ownerPlan(db,id,sessionId);
    if(p.status==='paused')return{ok:true,status:'paused'};
    db.prepare("UPDATE campaign_experiments SET status='paused' WHERE id=?").run(id);
    record(db,'experiment_paused',sessionId,p.control_branch);
    return{ok:true,status:'paused',note:'Новых назначений больше нет. Ранее зафиксированные показатели сохраняются.'};
  });
}
function activatePlan(db,platforms,sessionId,id,platformKey){
  const partner=findPlatform(platforms,platformKey);
  if(partner.mode!=='live'||!partner.secret)throw new AppError('Требуется настроенная live-платформа.',409,'LIVE_PARTNER_REQUIRED');
  return withTransaction(db,()=>{
    const plan=ownerPlan(db,id,sessionId);
    require('./experiment-close').assertNotClosed(db,id);
    if(plan.status==='paused')throw new AppError('Приостановленный план не возобновляется.',409,'PLAN_PAUSED');
    if(plan.status==='ready'){
      if(plan.platform_key!==partner.key)throw new AppError('Эксперимент уже закреплён за другой платформой.',409,'WRONG_PARTNER');
      return{ok:true,status:'ready',platformKey:partner.key};
    }
    db.prepare("UPDATE campaign_experiments SET platform_key=?,status='ready' WHERE id=? AND status='draft'").run(partner.key,id);
    record(db,'experiment_activated',sessionId,plan.control_branch);
    return{ok:true,status:'ready',platformKey:partner.key};
  });
}
function safeSubject(secret,partner,id,subject){
  if(typeof subject!=='string'||!tokenPattern.test(subject))throw new AppError('Партнёр должен передать случайный идентификатор участника 16–128 символов, не email/телефон.');
  const salt=partner.key+'\u001f'+id+'\u001f'+subject;
  return {hash:crypto.createHmac('sha256',secret).update('subject\u001f'+salt).digest('hex'),arm:crypto.createHmac('sha256',secret).update('arm\u001f'+salt).digest()[0]%2===0?'A':'B'};
}
function partnerPlan(db,partner,id){
  const p=requirePlan(db,id);
  if(p.platform_key!==partner.key||partner.mode!=='live')throw new AppError('Эксперимент не принадлежит live-партнёру.',403,'WRONG_PARTNER');
  visibility(db,p);return p;
}
function assign(db,partner,secret,request){
  const p=partnerPlan(db,partner,request.experimentId);
  if(p.status!=='ready')throw new AppError('Эксперимент не принимает новых назначений.',409,'EXPERIMENT_NOT_READY');
  const {hash,arm}=safeSubject(secret,partner,p.id,request.visitorKey);
  return withTransaction(db,()=>{
    require('./experiment-close').assertNotClosed(db,p.id);
    db.prepare(`INSERT OR IGNORE INTO experiment_assignments(experiment_id,platform_key,participant_hash,arm)
      VALUES(?,?,?,?)`).run(p.id,partner.key,hash,arm);
    const recorded=db.prepare('SELECT arm FROM experiment_assignments WHERE experiment_id=? AND platform_key=? AND participant_hash=?').get(p.id,partner.key,hash);
    if(recorded.arm!==arm)throw new AppError('Назначение участника изменилось.',409,'ASSIGNMENT_CONFLICT');
    return{experimentId:p.id,arm,metric:p.metric,creative:JSON.parse(arm==='A'?p.control_snapshot:p.treatment_snapshot),
      note:'Назначение зафиксировано, но показ ещё не подтверждён. Используйте защищённый HTTPS callback для фиксации показа.'};
  });
}
function event(db,partner,secret,request){
  const p=partnerPlan(db,partner,request.experimentId);
  if(!['impression','goal'].includes(request.kind)||typeof request.eventId!=='string'||!eventPattern.test(request.eventId))throw new AppError('Некорректный тип или идентификатор события.');
  const {hash,arm}=safeSubject(secret,partner,p.id,request.visitorKey);
  return withTransaction(db,()=>{
    require('./experiment-close').assertNotClosed(db,p.id);
    const old=db.prepare('SELECT experiment_id,participant_hash,kind,arm FROM experiment_event_ids WHERE platform_key=? AND event_id=?').get(partner.key,request.eventId);
    if(old){
      if(old.experiment_id!==p.id||old.participant_hash!==hash||old.kind!==request.kind||old.arm!==arm)throw new AppError('Повторное использование eventId с другими данными.',409,'EVENT_CONFLICT');
      return{ok:true,duplicate:true,kind:request.kind,arm};
    }
    const assigned=db.prepare('SELECT * FROM experiment_assignments WHERE experiment_id=? AND platform_key=? AND participant_hash=?').get(p.id,partner.key,hash);
    if(!assigned||assigned.arm!==arm)throw new AppError('Сначала запросите назначение участника.',409,'NO_ASSIGNMENT');
    if(request.kind==='goal'&&!assigned.impressed)throw new AppError('Целевое действие нельзя засчитать до подтверждённого показа.',409,'NO_IMPRESSION');
    if(request.kind==='goal'&&assigned.converted)throw new AppError('Повторная конверсия не учитывается.',409,'ALREADY_CONVERTED');
    if(request.kind==='impression'&&assigned.impressed)throw new AppError('Повторный показ одного участника не добавляет новый охват.',409,'ALREADY_IMPRESSED');
    db.prepare(`UPDATE experiment_assignments SET ${request.kind==='goal'?"converted=1,converted_at=CURRENT_TIMESTAMP":"impressed=1,impressed_at=CURRENT_TIMESTAMP"}
      WHERE experiment_id=? AND platform_key=? AND participant_hash=?`).run(p.id,partner.key,hash);
    db.prepare('INSERT INTO experiment_event_ids(platform_key,event_id,experiment_id,participant_hash,kind,arm) VALUES(?,?,?,?,?,?)')
      .run(partner.key,request.eventId,p.id,hash,request.kind,arm);
    record(db,request.kind==='goal'?'experiment_goal_live':'experiment_impression_live',null,p.control_branch,'signed_partner');
    return{ok:true,duplicate:false,kind:request.kind,arm};
  });
}
module.exports={ownerPlan,createPlan,listPlans,getPlan,kit,pausePlan,activatePlan,assign,event,planStats,safeSubject};
