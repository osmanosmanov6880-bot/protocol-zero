'use strict';
// WAVE 15. Owner-only command centre. Counts are real rows; no revenue/ROI estimation.
const {authorized}=require('./curation');
const {statusFor}=require('./campaign-control');
function count(db,q,id){return db.prepare(q).get(id).n;}
function overview(db,session,submissionId){
  const s=authorized(db,session,submissionId),id=s.campaign_id;
  const counts={
    visibleVariants:count(db,`WITH RECURSIVE visible(id) AS (
      SELECT id FROM branches WHERE campaign_id=? AND parent_id IS NULL AND moderation_status='visible'
      UNION ALL SELECT b.id FROM branches b JOIN visible v ON b.parent_id=v.id WHERE b.moderation_status='visible'
      ) SELECT COUNT(*) AS n FROM visible WHERE id NOT LIKE '%-ROOT'`,id),
    uniqueContributorBrowsers:count(db,`WITH RECURSIVE visible(id) AS (
      SELECT id FROM branches WHERE campaign_id=? AND parent_id IS NULL AND moderation_status='visible'
      UNION ALL SELECT b.id FROM branches b JOIN visible v ON b.parent_id=v.id WHERE b.moderation_status='visible'
      ) SELECT COUNT(DISTINCT b.creator_session) AS n FROM branches b JOIN visible v ON v.id=b.id
      WHERE b.parent_id IS NOT NULL AND b.creator_session IS NOT NULL`,id),
    creativePacks:count(db,'SELECT COUNT(*) AS n FROM creative_packs WHERE submission_id=?',submissionId),
    reviewRooms:count(db,'SELECT COUNT(*) AS n FROM review_rooms WHERE submission_id=?',submissionId),
    feedback:count(db,'SELECT COUNT(*) AS n FROM review_feedback f JOIN review_rooms r ON r.id=f.room_id WHERE r.submission_id=?',submissionId),
    experimentPlans:count(db,'SELECT COUNT(*) AS n FROM campaign_experiments WHERE submission_id=?',submissionId),
    closedExperiments:count(db,'SELECT COUNT(*) AS n FROM experiment_closures c JOIN campaign_experiments e ON c.experiment_id=e.id WHERE e.submission_id=?',submissionId),
    pilotRequests:count(db,'SELECT COUNT(*) AS n FROM pilot_requests WHERE submission_id=?',submissionId),
    milestoneAcknowledgements:count(db,"SELECT COUNT(*) AS n FROM pilot_milestones m JOIN pilot_requests p ON m.pilot_id=p.id WHERE p.submission_id=? AND m.status='acknowledged'",submissionId),
    signedLiveGoals:count(db,`SELECT COUNT(*) AS n FROM experiment_event_ids i JOIN campaign_experiments e ON e.id=i.experiment_id
       WHERE e.submission_id=? AND i.kind='goal'`,submissionId)
  };
  const recent=db.prepare(`SELECT name,created_at AS time FROM events WHERE branch_id IN
    (SELECT id FROM branches WHERE campaign_id=?) ORDER BY id DESC LIMIT 30`).all(id).filter(x=>[
    'mutation_completed','campaign_open','campaign_paused','creative_pack_created','experiment_closed'
  ].includes(x.name)).slice(0,12);
  const experiments=db.prepare(`SELECT e.id,e.status,e.metric,c.closed_at AS closedAt
    FROM campaign_experiments e LEFT JOIN experiment_closures c ON c.experiment_id=e.id
    WHERE e.submission_id=? ORDER BY e.created_at DESC LIMIT 10`).all(submissionId);
  const pilots=db.prepare('SELECT id,status,quote_eur_cents AS quoteEurCents FROM pilot_requests WHERE submission_id=? ORDER BY created_at DESC LIMIT 10').all(submissionId);
  return{schema:'protocol-zero/business-overview/v1',generatedAt:new Date().toISOString(),submissionId,
    brand:s.brand,campaignId:id,control:statusFor(db,id),counts,recent,experiments,pilots,
    caveats:[
      'Уникальные участники здесь — анонимные браузерные идентификаторы, не люди.',
      'Отзывы клиентов являются частным мнением, а не результатом рекламной кампании.',
      'SignedLiveGoals — события, подписанные подключённой платформой, без независимой проверки продаж.',
      'Стоимость коммерческого предложения, согласие на пилот и этапы не означают выручку или оплату.',
      'В системе нет финансовых транзакций. Выручка, ROAS и ROI намеренно не вычисляются.'
    ]};
}
module.exports={overview};
