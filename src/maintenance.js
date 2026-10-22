'use strict';
// Wave 5: explicit, local-operator-only data minimisation. No automated deletion jobs.
// Caller must back up DB before executing. No public HTTP route.
const {withTransaction}=require('./database');
const RETENTION={eventsDays:180,expiredInviteGraceDays:30,expiredHandoffGraceDays:30,declinedContactDays:90,idleSessionDays:180};
function selectors(){return{
  oldEvents:"created_at < datetime('now','-180 days')",
  staleInvite:"child_id IS NULL AND julianday(expires_at) < julianday('now','-30 days')",
  staleHandoff:"julianday(expires_at) < julianday('now','-30 days') AND NOT EXISTS (SELECT 1 FROM partner_receipts r WHERE r.handoff_id=handoffs.id)",
  contact:"status IN ('rejected','withdrawn') AND contact_email!='' AND COALESCE(reviewed_at,created_at) < datetime('now','-90 days')",
  idleSession:`last_seen_at < datetime('now','-180 days')
    AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.creator_session=sessions.id)
    AND NOT EXISTS (SELECT 1 FROM brand_submissions s WHERE s.owner_session=sessions.id)
    AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_session=sessions.id)
    AND NOT EXISTS (SELECT 1 FROM handoffs h WHERE h.owner_session=sessions.id)
    AND NOT EXISTS (SELECT 1 FROM review_rooms r WHERE r.owner_session=sessions.id)
    AND NOT EXISTS (SELECT 1 FROM review_feedback f WHERE f.visitor_session=sessions.id)
    AND NOT EXISTS (SELECT 1 FROM pilot_requests p WHERE p.owner_session=sessions.id)
    AND NOT EXISTS (SELECT 1 FROM invites i WHERE i.creator_session=sessions.id AND i.child_id IS NULL AND i.expires_at>datetime('now'))`
};}
function maintenance(db,{execute=false,confirmBackup=false}={}){
  const q=selectors();
  const queries={oldEvents:`SELECT COUNT(*) AS n FROM events WHERE ${q.oldEvents}`,
    unusedExpiredInvites:`SELECT COUNT(*) AS n FROM invites WHERE ${q.staleInvite}`,
    outdatedHandoffs:`SELECT COUNT(*) AS n FROM handoffs WHERE ${q.staleHandoff}`,
    rejectedContactEmails:`SELECT COUNT(*) AS n FROM brand_submissions WHERE ${q.contact}`,
    idleUnusedSessions:`SELECT COUNT(*) AS n FROM sessions WHERE ${q.idleSession}`};
  const counts=Object.fromEntries(Object.entries(queries).map(([k,v])=>[k,db.prepare(v).get().n]));
  const result={dryRun:!execute,retention:RETENTION,eligible:counts,
    caveat:'Очищаются только старые события, неиспользованные приглашения/передачи и контактные данные отклонённых заявок. Одобренные публичные ветви и подтверждённые партнёрские события сохраняются.'};
  if(!execute)return result;
  if(confirmBackup!==true)throw new Error('Перед очисткой сделайте резервную копию и передайте confirmBackup=true.');
  return withTransaction(db,()=>{
    db.prepare(`DELETE FROM events WHERE ${q.oldEvents}`).run();
    db.prepare(`DELETE FROM invites WHERE ${q.staleInvite}`).run();
    db.prepare(`DELETE FROM handoffs WHERE ${q.staleHandoff}`).run();
    db.prepare(`UPDATE brand_submissions SET contact_email='',contact_consent_at=NULL WHERE ${q.contact}`).run();
    db.prepare(`DELETE FROM sessions WHERE ${q.idleSession}`).run();
    return {...result,dryRun:false,completedAt:new Date().toISOString()};
  });
}
module.exports={maintenance,RETENTION};
