'use strict';
// WAVE 10 operator-only readiness; never claims external service connectivity.
function doctor(db){
  const result=db.prepare('PRAGMA integrity_check').all().map(r=>r.integrity_check);
  const foreignKeys=db.prepare('PRAGMA foreign_key_check').all();
  const version=db.prepare('SELECT sqlite_version() AS version').get().version;
  const counts={};
  const fields={
    communityCampaigns:"SELECT COUNT(*) AS n FROM campaigns WHERE origin='community'",
    pendingBriefs:"SELECT COUNT(*) AS n FROM brand_submissions WHERE status='pending'",
    reviewRooms:'SELECT COUNT(*) AS n FROM review_rooms',
    reviewFeedback:'SELECT COUNT(*) AS n FROM review_feedback',
    experiments:'SELECT COUNT(*) AS n FROM campaign_experiments',
    pilotRequests:'SELECT COUNT(*) AS n FROM pilot_requests',
    commercialOffers:"SELECT COUNT(*) AS n FROM pilot_requests WHERE status='proposal_sent'",
    acceptedInterests:"SELECT COUNT(*) AS n FROM pilot_requests WHERE status='accepted'",
    verifiedPayments:'SELECT 0 AS n'
  };
  for(const[name,sql]of Object.entries(fields))counts[name]=db.prepare(sql).get().n;
  return{ok:result.length===1&&result[0]==='ok'&&foreignKeys.length===0,
    generatedAt:new Date().toISOString(),sqliteVersion:version,integrity:result,foreignKeyErrors:foreignKeys.length,
    counts,verifiedPaymentsStatus:'NOT_SUPPORTED',
    exclusions:['HTTPS proxy','backups tested offsite','external partner callback','legal compliance','payment settlement','capacity/load testing'],
    note:'Локальная проверка целостности не доказывает production-готовность или реальный коммерческий спрос.'};
}
module.exports={doctor};
