'use strict';
// WAVE 08: diagnostics, NOT a claim of causal impact or independently verified purchases.
const {ownerPlan}=require('./experiments');
function wilson(success,total){
  if(!total)return null;
  const z=1.95996398454,phat=success/total,z2=z*z,denom=1+z2/total;
  const center=(phat+z2/(2*total))/denom;
  const margin=z*Math.sqrt((phat*(1-phat)+z2/(4*total))/total)/denom;
  return {estimate:+(100*phat).toFixed(2),lower:+(100*Math.max(0,center-margin)).toFixed(2),upper:+(100*Math.min(1,center+margin)).toFixed(2),denominator:total};
}
function auditExperiment(db,session,id){
  const p=ownerPlan(db,id,session);
  const rows=db.prepare(`SELECT arm, COUNT(*) AS assignments,
    COALESCE(SUM(impressed),0) AS impressions, COALESCE(SUM(converted),0) AS goals
    FROM experiment_assignments WHERE experiment_id=? GROUP BY arm`).all(id);
  const arms={A:{assignments:0,impressions:0,goals:0},B:{assignments:0,impressions:0,goals:0}};
  for(const row of rows)arms[row.arm]={assignments:row.assignments,impressions:row.impressions,goals:row.goals};
  for(const k of ['A','B']){
    arms[k].goalRate=wilson(arms[k].goals,arms[k].impressions);
    arms[k].exposureRate=wilson(arms[k].impressions,arms[k].assignments);
  }
  const n=arms.A.assignments+arms.B.assignments;
  const chi2=n?(arms.A.assignments-arms.B.assignments)**2/n:null;
  const srm=n>=100&&chi2>10.8276;
  const totalImp=arms.A.impressions+arms.B.impressions;
  const flags=[];
  if(p.status==='draft')flags.push({code:'NO_LIVE_PARTNER',severity:'info',text:'Это только план: live-партнёр ещё не назначает участников.'});
  if(n<100)flags.push({code:'TOO_FEW_ASSIGNMENTS',severity:'info',text:'Менее 100 назначений — нельзя проверить равномерность распределения с достаточной чувствительностью.'});
  if(srm)flags.push({code:'SAMPLE_RATIO_MISMATCH',severity:'warning',text:'Дисбаланс назначений при ожидаемых 50/50 (хи-квадрат больше 10,83). Проверьте интеграцию до интерпретации результата.'});
  if(totalImp<100)flags.push({code:'INSUFFICIENT_EXPOSURE',severity:'info',text:'Менее 100 подтверждённых показов в двух группах.'});
  if(arms.A.assignments>30&&arms.B.assignments>30){
    const gap=Math.abs(arms.A.impressions/arms.A.assignments-arms.B.impressions/arms.B.assignments);
    if(gap>.15)flags.push({code:'EXPOSURE_IMBALANCE',severity:'warning',text:'Доли показов между группами различаются более чем на 15 процентных пунктов.'});
  }
  const bothEnough=arms.A.impressions>=50&&arms.B.impressions>=50;
  if(!bothEnough)flags.push({code:'LOW_SAMPLE',severity:'info',text:'Меньше 50 показов в одной из групп. Интервалы неопределённости особенно широки.'});
  const points=bothEnough?+(arms.B.goalRate.estimate-arms.A.goalRate.estimate).toFixed(2):null;
  return{experimentId:p.id,metric:p.metric,status:p.status,generatedAt:new Date().toISOString(),arms,totalAssignments:n,
    balance:{chiSquare:chi2===null?null:+chi2.toFixed(4),expectedSplit:'50/50',warning:srm,checked:n>=100},
    descriptiveDifferencePercentagePoints:points,flags,
    interpretation:'95%-интервалы Wilson отражают неопределённость долей среди подписанных показов. Они не гарантируют случайность назначения, причинный эффект, достоверность событий партнёра или статистическую значимость различия. Без внешней сверки нет подтверждённых продаж.',
    decision:'Недостаточно оснований автоматически объявлять победителя или масштабировать рекламу.'};
}
module.exports={wilson,auditExperiment};
