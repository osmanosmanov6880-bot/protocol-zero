'use strict';
// Full-population, first-party funnel. Client intent is explicitly labelled unverified.
function funnel(db){
  const single=sql=>db.prepare(sql).get().n;
  const count={
    observedBrowsers:single("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE name='portal_view'"),
    interactionStarted:single("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE name='interaction_started' AND source='client'"),
    creators:single('SELECT COUNT(DISTINCT creator_session) AS n FROM branches WHERE parent_id IS NOT NULL AND creator_session IS NOT NULL'),
    sentInvites:single('SELECT COUNT(DISTINCT creator_session) AS n FROM invites'),
    acceptedInvites:single('SELECT COUNT(DISTINCT used_by) AS n FROM invites WHERE child_id IS NOT NULL AND used_by IS NOT NULL'),
    handoffCreated:single('SELECT COUNT(DISTINCT owner_session) AS n FROM handoffs WHERE owner_session IS NOT NULL'),
    handoffOpened:single('SELECT COUNT(DISTINCT owner_session) AS n FROM handoffs WHERE owner_session IS NOT NULL AND opened_at IS NOT NULL'),
    handoffResolved:single('SELECT COUNT(DISTINCT owner_session) AS n FROM handoffs WHERE owner_session IS NOT NULL AND resolved_at IS NOT NULL'),
    sandboxConfirmed:single("SELECT COUNT(DISTINCT h.owner_session) AS n FROM handoffs h JOIN partner_receipts r ON r.handoff_id=h.id WHERE h.owner_session IS NOT NULL AND r.environment='sandbox'"),
    liveConfirmed:single("SELECT COUNT(DISTINCT h.owner_session) AS n FROM handoffs h JOIN partner_receipts r ON r.handoff_id=h.id WHERE h.owner_session IS NOT NULL AND r.environment='live'"),
    legacyVerifiedBranches:single('SELECT COUNT(DISTINCT branch_id) AS n FROM platform_events'),
    businessBriefSubmitted:single("SELECT COUNT(DISTINCT owner_session) AS n FROM brand_submissions WHERE owner_session IS NOT NULL"),
    businessBriefApproved:single("SELECT COUNT(*) AS n FROM brand_submissions WHERE status='approved'"),
    userSelfReports:single("SELECT COUNT(DISTINCT creator_session) AS n FROM branches WHERE action_status='reported' AND creator_session IS NOT NULL")
  };
  const total=count.observedBrowsers;
  const row=(stage,quantity,level,meaning)=>({stage,count:quantity,ofVisitors:total?Math.round(quantity/total*1000)/10:null,evidence:level,note:meaning});
  return {
    generatedAt:new Date().toISOString(),
    rows:[
      row('Посетили портал',count.observedBrowsers,'server','Сессия в текущем браузере; может быть одним из устройств того же человека'),
      row('Нажали начать',count.interactionStarted,'client','Только клиентский сигнал, не доказательство действия'),
      row('Подали бриф бизнеса',count.businessBriefSubmitted,'database','Частная заявка; не публикация и не платный заказ'),
      row('Бриф бизнеса одобрен',count.businessBriefApproved,'operator','Ручная модерация; не подтверждение спроса и не продажа'),
      row('Создали реальную ветвь',count.creators,'database','Создание подтверждено записью в SQLite'),
      row('Создали приглашение',count.sentInvites,'database','Не равно переходу приглашённого'),
      row('Приняли приглашение',count.acceptedInvites,'database','Приглашённый завершил изменение'),
      row('Подготовили передачу',count.handoffCreated,'database','Не равно переходу на внешнюю платформу'),
      row('Открыли переход',count.handoffOpened,'server','Не равно созданному рекламному результату'),
      row('Партнёр получил бриф',count.handoffResolved,'signed_request','Не равно созданию макета'),
      row('Демо-макет подтверждён',count.sandboxConfirmed,'sandbox','Только отдельная тестовая площадка'),
      row('Live-макет подтверждён',count.liveConfirmed,'live_webhook','Подписанное событие реального подключённого партнёра, не покупка'),
    ],
    other:{legacyVerifiedBranches:count.legacyVerifiedBranches,userSelfReports:count.userSelfReports},
    referral:(()=>{
      const firstInvited=single(`WITH first_mutation AS (
        SELECT creator_session,MIN(rowid) AS first_id FROM branches WHERE creator_session IS NOT NULL AND parent_id IS NOT NULL GROUP BY creator_session
      ) SELECT COUNT(DISTINCT i.used_by) AS n FROM invites i JOIN branches child ON child.id=i.child_id
         JOIN first_mutation f ON f.creator_session=i.used_by AND child.rowid=f.first_id
         WHERE i.child_id IS NOT NULL AND i.used_by IS NOT NULL`);
      return{completedInvitations:single('SELECT COUNT(*) AS n FROM invites WHERE child_id IS NOT NULL'),
        firstObservedViaInvite:firstInvited,distinctCreators:count.creators,
        coefficient:count.creators?Math.round(firstInvited/count.creators*1000)/1000:null,
        denominator:'all activated creator browser sessions; only first observed mutation through a completed invite is counted in the numerator',
        caveat:'Observed in-product referral fraction, not incremental or causal virality K.'};
    })(),
    caveat:'Это накопительные показатели анонимных браузеров, не уникальных людей, и не когортная причинная оценка. Платежи не учитываются.'
  };
}
module.exports={funnel};
