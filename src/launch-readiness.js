'use strict';
// WAVE 20: operational preflight without inventing customers, payments or live integrations.
const {authorized}=require('./curation');
const {verify}=require('./commercial-audit');
const {summary}=require('./partner-evidence');
function campaign(db,session,submissionId,platforms=[]){
  const sub=authorized(db,session,submissionId);
  const evidence=summary(db,session,submissionId);
  const counts={
    variants:db.prepare('SELECT COUNT(*) AS n FROM branches WHERE campaign_id=? AND parent_id IS NOT NULL').get(sub.campaign_id).n,
    packs:db.prepare('SELECT COUNT(*) AS n FROM creative_packs WHERE submission_id=?').get(submissionId).n,
    deliverables:db.prepare('SELECT COUNT(*) AS n FROM campaign_deliverables WHERE submission_id=?').get(submissionId).n,
    reviews:db.prepare('SELECT COUNT(*) AS n FROM review_feedback f JOIN review_rooms r ON r.id=f.room_id WHERE r.submission_id=?').get(submissionId).n,
    approvedPilots:db.prepare("SELECT COUNT(*) AS n FROM pilot_requests WHERE submission_id=? AND status='accepted'").get(submissionId).n
  };
  const liveConfigured=platforms.filter(p=>p.mode==='live'&&!!p.secret).length;
  const actualLiveArtifacts=evidence.count.live.artifact_created+evidence.count.live.campaign_saved;
  const audit=verify(db,submissionId);
  const checks=[
    {key:'campaign',name:'Рекламный бриф одобрен вручную',pass:sub.status==='approved'},
    {key:'variants',name:'Хотя бы один публичный рекламный вариант',pass:counts.variants>0},
    {key:'pack',name:'Зафиксирована подборка креативов',pass:counts.packs>0},
    {key:'deliverable',name:'Выпущен клиентский файл для передачи',pass:counts.deliverables>0},
    {key:'audit',name:'Внутренний журнал решений целостен',pass:audit.ok},
    {key:'live_connected',name:'Есть настроенный live-партнёр с серверной подписью',pass:liveConfigured>0},
    {key:'live_receipts',name:'Live-партнёр подтвердил создание артефакта',pass:actualLiveArtifacts>0},
    {key:'customer_review',name:'Есть клиентский отзыв',pass:counts.reviews>0}
  ];
  return{schema:'protocol-zero/campaign-readiness/v1',submissionId,campaignId:sub.campaign_id,brand:sub.brand,
    generatedAt:new Date().toISOString(),technicalChecks:checks,passed:checks.filter(c=>c.pass).length,total:checks.length,
    counts,configuredLivePartners:liveConfigured,livePartnerArtifactEvents:actualLiveArtifacts,
    status:checks.every(c=>c.pass)?'TECHNICAL_PILOT_CANDIDATE':'BLOCKED',
    businessValidation:'NOT_VERIFIED',paymentIntegration:'NOT_INSTALLED',
    externalRequirements:['Провести правовую и privacy-проверку перед публикацией в ЕС.',
      'Подтвердить рекламные факты и права на материалы вне автоматического Creative Guard.',
      'Проверить резервное копирование и восстановление вне локального компьютера.',
      'Протестировать HTTPS, нагрузку, уязвимости и контроль доступа в целевой среде.',
      'Провести платный пилот с реальным клиентом и измерить стоимость привлечения.'],
    note:'Зелёный технический чеклист не является сертификатом безопасности, доказательством продаж или разрешением на production-публикацию.'};
}
function operator(db,platforms){
  const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check;
  const foreignKeys=db.prepare('PRAGMA foreign_key_check').all();
  const configured=platforms.map(p=>({key:p.key,mode:p.mode,signatureConfigured:!!p.secret}));
  return{ok:integrity==='ok'&&foreignKeys.length===0,sqliteIntegrity:integrity,
    foreignKeyViolations:foreignKeys.length,configuredPlatforms:configured,
    livePartnersReady:configured.filter(x=>x.mode==='live'&&x.signatureConfigured).length,
    encryptedAtRest:'NOT_VERIFIED',offsiteRestore:'NOT_VERIFIED',payments:'NOT_INSTALLED',
    note:'Локальный preflight — не независимый security audit и не deployment approval.'};
}
module.exports={campaign,operator};
