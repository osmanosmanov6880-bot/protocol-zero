'use strict';
// WAVE 10: conservative, operator-only retention with mandatory backup confirmation.
const {withTransaction}=require('./database');
function commercialMaintenance(db,{execute=false,confirmBackup=false}={}){
  const rules={
    expiredRooms:"(julianday(expires_at)<julianday('now','-30 days') OR julianday(revoked_at)<julianday('now','-30 days'))",
    concludedPilots:"status IN ('accepted','declined','withdrawn') AND julianday(updated_at)<julianday('now','-365 days')"
  };
  const eligible={
    expiredReviewRooms:db.prepare(`SELECT COUNT(*) AS n FROM review_rooms WHERE ${rules.expiredRooms}`).get().n,
    concludedPilotRequests:db.prepare(`SELECT COUNT(*) AS n FROM pilot_requests WHERE ${rules.concludedPilots}`).get().n
  };
  const summary={dryRun:!execute,eligible,policy:{expiredOrRevokedRoomGraceDays:30,concludedPilotRetentionDays:365},
    note:'Удаление необратимо и затрагивает каскадные отзывы и журнал переговоров. Экспортируйте нужные данные до очистки. Не заменяет юридическую политику хранения.'};
  if(!execute)return summary;
  if(!confirmBackup)throw new Error('Подтвердите предварительную резервную копию: --backup-confirmed.');
  return withTransaction(db,()=>{
    db.prepare(`DELETE FROM review_rooms WHERE ${rules.expiredRooms}`).run();
    db.prepare(`DELETE FROM pilot_requests WHERE ${rules.concludedPilots}`).run();
    return{...summary,dryRun:false,completedAt:new Date().toISOString()};
  });
}
module.exports={commercialMaintenance};
