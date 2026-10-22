'use strict';
// Wave 1: deterministic creative preflight. No AI rating, legal certification or performance prediction.
const {AppError}=require('./database');
const URL_RE=/(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|ru|org|net|io|app|co|dev|world)(?:\b|\/))/i;
const EMAIL_RE=/(?:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;
const PHONE_RE=/(?:\+\d[\d\s()\-]{9,}\d)/;
const CLAIM_RE=/(?:\b\d+(?:[.,]\d+)?\s*(?:%|час(?:ов|а)?\b|дн(?:я|ей|и)\b|недель\b|руб(?:лей)?\b|евро\b|€|\$|минут\b|раза?\b)|\b(?:гарантир[а-я]+|лучший|№\s*1|номер\s*один|100\s*%|без\s*риска|всегда)\b)/i;
const URGENCY_RE=/(?:только сегодня|осталось \d+ мест|последний шанс|успей(?:те)?|закончится через)/i;
function cleanCreative(value){
  if(typeof value!=='string'||value.length>5000)throw new AppError('Некорректный рекламный текст.');
  return value.trim().replace(/\s+/g,' ');
}
function publicRisks({hook='',cta='',evidence='',promise='',origin='demo'}){
  const creative=[hook,cta].join(' ');
  const findings=[];
  if(URL_RE.test(creative)||EMAIL_RE.test(creative)||PHONE_RE.test(creative))findings.push({code:'CONTACT_IN_CREATIVE',severity:'high',text:'Контактные данные и внешние адреса нельзя публиковать внутри изменяемого текста.'});
  if(CLAIM_RE.test(creative))findings.push({code:'CLAIM_REQUIRES_PROOF',severity:'high',text:'Числа, превосходные степени и гарантии требуют документального подтверждения рекламодателя.'});
  if(URGENCY_RE.test(creative))findings.push({code:'ARTIFICIAL_URGENCY',severity:'medium',text:'Проверьте, что ограничение по времени или количеству реально и подтверждено.'});
  if(origin==='demo')findings.push({code:'DEMO_NOT_PRODUCT',severity:'info',text:'Бренд вымышленный; публиковать результат как рекламу существующего продукта нельзя.'});
  if(!evidence||/демонстрацион|не проверен|учебный|заявител/i.test(evidence))findings.push({code:'EVIDENCE_NOT_VERIFIED',severity:'info',text:'Система не проверила доказательства и характеристики продукта.'});
  return {status:findings.some(f=>f.severity==='high')?'needs_human_review':findings.some(f=>f.severity==='medium')?'review_suggested':'no_automated_flags',findings,scope:'Предварительный детерминированный анализ текста: не подтверждает правдивость, законность или эффективность.',fixedContext:{promise,evidence}};
}
function mutationGuard(gene,value){
  if(gene!=='hook'&&gene!=='cta')return;
  const v=cleanCreative(value);
  if(URL_RE.test(v)||EMAIL_RE.test(v)||PHONE_RE.test(v))throw new AppError('Не вставляйте сайты, email или телефоны в публичные мутации.',400,'CONTACT_IN_CREATIVE');
}
module.exports={publicRisks,mutationGuard};
