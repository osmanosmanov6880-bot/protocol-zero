'use strict';
// Wave 4: owner-specific, first-party, privacy-minimised campaign participation metrics.
// This is creative participation data, NEVER ad conversion or sales performance.
const {authorized}=require('./curation');
function insights(db,sessionId,submissionId){
  const sub=authorized(db,sessionId,submissionId),campaignId=sub.campaign_id;
  const all=db.prepare(`WITH RECURSIVE published(id) AS (
    SELECT id FROM branches WHERE campaign_id=? AND parent_id IS NULL AND moderation_status='visible'
    UNION ALL SELECT b.id FROM branches b JOIN published p ON b.parent_id=p.id WHERE b.moderation_status='visible'
  ) SELECT b.id,b.changed_gene AS gene,b.creator_session AS sessionId,b.created_at AS createdAt
    FROM published p JOIN branches b ON b.id=p.id WHERE b.parent_id IS NOT NULL`).all(campaignId);
  const visibleIds=new Set(all.map(r=>r.id));
  const inviteRows=db.prepare(`SELECT i.branch_id AS parentId,i.child_id AS childId,i.used_by AS usedBy
    FROM invites i JOIN branches b ON b.id=i.branch_id WHERE b.campaign_id=?`).all(campaignId);
  const creators=new Set(all.map(r=>r.sessionId).filter(Boolean));
  const accepted=inviteRows.filter(i=>i.childId&&visibleIds.has(i.childId));
  const distinctInvitees=new Set(accepted.map(i=>i.usedBy).filter(Boolean));
  // Count only participants whose first ever public mutation was a fulfilled invitation in this campaign.
  // Excludes established creators and repeats; still not proof of truly incremental acquisition.
  const firstInvited=new Set();
  for(const invite of accepted){
    if(!invite.usedBy)continue;
    const first=db.prepare(`SELECT id FROM branches WHERE creator_session=? AND parent_id IS NOT NULL ORDER BY rowid ASC LIMIT 1`).get(invite.usedBy);
    if(first?.id===invite.childId)firstInvited.add(invite.usedBy);
  }
  const weeks=new Map(),geneCounts={hook:0,tone:0,cta:0};
  for(const r of all){
    if(r.gene in geneCounts)geneCounts[r.gene]++;
    const week=db.prepare("SELECT strftime('%Y-%W',?) AS label").get(r.createdAt).label||'unknown';
    const row=weeks.get(week)||{week,mutations:0,sessions:new Set()};
    row.mutations++;if(r.sessionId)row.sessions.add(r.sessionId);weeks.set(week,row);
  }
  const editorial=db.prepare(`SELECT status,COUNT(*) AS n FROM brand_variant_reviews WHERE submission_id=? GROUP BY status`).all(submissionId);
  const editorialCounts={candidate:0,shortlisted:0,discarded:0};
  for(const r of editorial)if(r.status in editorialCounts)editorialCounts[r.status]=r.n;
  const counts={publishedMutations:all.length,participantBrowsers:creators.size,invitesSent:inviteRows.length,
    inviteCompletions:accepted.length,distinctInviteeBrowsers:distinctInvitees.size,firstObservedViaInvite:firstInvited.size,
    firstInviteObservedRatio:creators.size?Math.round(firstInvited.size/creators.size*10000)/100:null};
  return{brand:sub.brand,submissionId,campaignId,counts,geneCounts,editorial:editorialCounts,
    weeks:[...weeks.values()].sort((a,b)=>a.week.localeCompare(b.week)).slice(-16).map(({week,mutations,sessions})=>({week,mutations,participantBrowsers:sessions.size})),
    caveats:[
      'Участники — анонимные браузерные сессии, не уникальные люди. Данные охватывают только опубликованные видимые ветви.',
      'Первое приглашённое действие — наблюдаемая активация через приглашение. Это не причинная оценка вирусности.',
      'Данные не являются рекламными показами, кликами, продажами или доказательством эффективности.',
      'Скрытые ветви, частные заметки и неразрешённые заявки отсутствуют в отчёте.'
    ]};
}
module.exports={insights};
