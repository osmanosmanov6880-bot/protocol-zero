'use strict';
// Offline operator console. Deliberately no public admin HTTP route.
const { DatabaseSync }=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const {moderationSet}=require('./database');
const {funnel}=require('./analytics');
const {queue,operatorView,reviewSubmission}=require('./submissions');
const {maintenance}=require('./maintenance');
const {commercialMaintenance}=require('./commercial-maintenance');
const PILOTS=require('./pilots');
const MILESTONES=require('./pilot-milestones');
const CONTROL=require('./campaign-control');
const {doctor}=require('./doctor');
const READINESS=require('./launch-readiness');
const AUDIT=require('./commercial-audit');
const {loadPlatforms}=require('./bridge');
const file=process.env.DB_PATH||path.join(__dirname,'..','data','protocol-zero.sqlite');
if(!fs.existsSync(file)){console.error('База не найдена:',file);process.exit(1);}
const db=new DatabaseSync(file);
db.exec('PRAGMA foreign_keys=ON;');
const [command,arg,...reasonWords]=process.argv.slice(2);
const count=q=>db.prepare(q).get().n;
try{
  if(command==='release-preflight'){
    const sources=loadPlatforms(path.join(__dirname,'..'),process.env.NODE_ENV==='production');
    const infrastructure=READINESS.operator(db,sources);
    const approved=db.prepare("SELECT id FROM brand_submissions WHERE status='approved'").all();
    const auditResults=approved.map(s=>({submissionId:s.id,...AUDIT.verify(db,s.id)}));
    const report={version:'3.4.0',infrastructure,campaignsAudited:auditResults.length,
      integrityIssues:auditResults.filter(x=>!x.ok),
      productionClaim:'NOT_VERIFIED',note:'Команда только проверяет текущую локальную базу и конфигурацию; внешние сайты, compliance и платежи не тестируются.'};
    console.log(JSON.stringify(report,null,2));
    if(!infrastructure.ok||report.integrityIssues.length)process.exitCode=1;
  }else if(command==='team-prune'){
    const flags=[arg,...reasonWords],execute=flags.includes('--execute');
    if(execute&&!flags.includes('--backup-confirmed'))throw new Error('Перед очисткой сделайте резервную копию и добавьте --backup-confirmed.');
    const cutoff=new Date(Date.now()-30*86400000).toISOString();
    const eligible=db.prepare("SELECT COUNT(*) AS n FROM team_invitations WHERE (expires_at<? OR revoked_at<?) AND redeemed_at IS NULL").get(cutoff,cutoff).n;
    if(execute)db.prepare("DELETE FROM team_invitations WHERE (expires_at<? OR revoked_at<?) AND redeemed_at IS NULL").run(cutoff,cutoff);
    console.log(JSON.stringify({dryRun:!execute,eligible,policy:'Только использованные никак и просроченные более 30 дней ссылки команды; членство действующих участников остаётся.'},null,2));
  }else if(command==='doctor'){
    const report=doctor(db);console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
  }else if(command==='commercial-prune'){
    const flags=[arg,...reasonWords];const execute=flags.includes('--execute');
    if(execute&&!flags.includes('--backup-confirmed'))throw new Error('Сначала сделайте резервную копию. Для очистки: commercial-prune --execute --backup-confirmed');
    console.log(JSON.stringify(commercialMaintenance(db,{execute,confirmBackup:flags.includes('--backup-confirmed')}),null,2));
  }else if(command==='campaign-pause'||command==='campaign-resume'){
    console.log(CONTROL.operatorUpdate(db,arg,command==='campaign-pause'?'paused':'open',reasonWords.join(' ')));
  }else if(command==='milestones'){
    console.log(JSON.stringify(MILESTONES.operatorList(db,arg),null,2));
  }else if(command==='milestone-add'){
    const title=reasonWords[0],description=reasonWords.slice(1).join(' ');
    console.log(MILESTONES.create(db,arg,title,description));
  }else if(command==='milestone-submit'){
    const milestoneId=reasonWords[0],explanation=reasonWords.slice(1).join(' ');
    console.log(MILESTONES.submit(db,arg,milestoneId,explanation));
  }else if(command==='pilots'){
    console.table(PILOTS.operatorList(db));
  }else if(command==='pilot-view'){
    console.log(JSON.stringify(PILOTS.operatorGet(db,arg),null,2));
  }else if(command==='pilot-review'){
    console.log(PILOTS.operatorAction(db,arg,'reviewing',{explanation:reasonWords.join(' ')}));
  }else if(command==='pilot-decline'){
    console.log(PILOTS.operatorAction(db,arg,'declined',{explanation:reasonWords.join(' ')}));
  }else if(command==='pilot-offer'){
    const amount=Number(reasonWords[0]);const explanation=reasonWords[1];const proposal=reasonWords.slice(2).join(' ');
    console.log(PILOTS.operatorAction(db,arg,'proposal_sent',{quoteEurCents:amount,explanation,proposal}));
  }else if(command==='prune'){
    const flags=[arg,...reasonWords];
    const execute=flags.includes('--execute');
    if(execute&&!flags.includes('--backup-confirmed'))throw new Error('Для удаления: npm run ops -- prune --execute --backup-confirmed (сначала сохраните резервную копию).');
    const result=maintenance(db,{execute,confirmBackup:flags.includes('--backup-confirmed')});
    console.log('PROTOCOL ZERO / DATA RETENTION',JSON.stringify(result,null,2));
  }else if(command==='experiments'){
    const rows=db.prepare(`SELECT e.id,e.campaign_id AS campaign,e.status,e.metric,e.platform_key AS platform,
     (SELECT COUNT(*) FROM experiment_assignments a WHERE a.experiment_id=e.id AND a.impressed=1) AS impressions,
     (SELECT COUNT(*) FROM experiment_assignments a WHERE a.experiment_id=e.id AND a.converted=1) AS goals
     FROM campaign_experiments e ORDER BY e.created_at DESC LIMIT 100`).all();
    if(rows.length)console.table(rows);else console.log('А/В планов нет.');
    console.log('Эти цели — подписанные события платформы, не независимый аудит продаж.');
  }else if(command==='briefs'){
    const rows=queue(db);
    if(!rows.length)console.log('Новых рекламных брифов нет.');else console.table(rows);
    console.log('Просмотр: npm run ops -- brief-view BRF-ID');
  }else if(command==='brief-unpublish'||command==='brief-republish'){
    if(!arg||reasonWords.join(' ').trim().length<12)throw new Error('Укажите ID брифа и основание не короче 12 символов.');
    const sub=operatorView(db,arg);
    if(sub.status!=='approved'||!sub.campaign_id)throw new Error('Можно менять публичность только одобренного коммерческого генома.');
    console.log(moderationSet(db,sub.campaign_id+'-ROOT',command==='brief-unpublish'?'hidden':'visible',reasonWords.join(' ')));
  }else if(command==='brief-view'){
    if(!arg)throw new Error('Укажите идентификатор заявки.');
    const item=operatorView(db,arg);
    console.log(JSON.stringify(item,null,2));
    console.log('Подтвердите факты, права и согласие на публикацию ВНЕ системы перед одобрением. Сама система этого не проверяет.');
  }else if(command==='brief-approve'||command==='brief-reject'){
    if(!arg||reasonWords.length===0)throw new Error('Укажите ID заявки и подробную причину решения.');
    if(command==='brief-approve'&&!reasonWords.includes('--manual-review')){
      throw new Error('Одобрение требует фактической ручной проверки. Добавьте --manual-review после подробной причины.');
    }
    const why=reasonWords.filter(x=>x!=='--manual-review').join(' ').trim();
    console.log(reviewSubmission(db,arg,command==='brief-approve'?'approved':'rejected',why));
  }else if(command==='funnel'||command==='funnel-csv'){
    const out=funnel(db);
    if(command==='funnel'){
      console.log('\nPROTOCOL ZERO / ФАКТИЧЕСКАЯ ВОРОНКА / '+out.generatedAt);
      console.table(out.rows);
      console.log('Коэффициент приглашений (на всех авторов):',out.referral.coefficient,'; завершено:',out.referral.completedInvitations);
      console.log('Важная оговорка:',out.caveat);
    }else{
      if(!arg)throw new Error('Укажите путь CSV файла.');
      const csv=(arr)=>arr.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',');
      const lines=[csv(['stage','count','percent_of_portal_browsers','evidence','note']),...out.rows.map(r=>csv([r.stage,r.count,r.ofVisitors,r.evidence,r.note]))];
      fs.writeFileSync(path.resolve(arg),'\uFEFF'+lines.join('\r\n')+'\r\n',{flag:'wx',mode:0o600});
      console.log('CSV сохранён:',path.resolve(arg),'(не содержит персональных данных)');
    }
  }else if(command==='handoffs'){
    const rows=db.prepare(`SELECT h.id,h.platform_key AS platform,h.platform_mode AS mode,
      h.source,h.opened_at AS opened,h.resolved_at AS received,h.revoked_at AS revoked,
      COUNT(r.event_id) AS receipts
      FROM handoffs h LEFT JOIN partner_receipts r ON r.handoff_id=h.id
      GROUP BY h.id ORDER BY h.created_at DESC LIMIT 50`).all();
    if(!rows.length)console.log('Передач пока нет.');else console.table(rows);
  }else if(command==='queue'){
    const rows=db.prepare(`SELECT r.branch_id AS id, COUNT(*) AS reports,
      group_concat(DISTINCT r.reason) AS reasons,
      b.moderation_status AS status,b.generation,b.hook
      FROM branch_reports r JOIN branches b ON b.id=r.branch_id
      GROUP BY r.branch_id ORDER BY reports DESC,r.id DESC LIMIT 100`).all();
    console.log('\nПРОТОКОЛ НУЛЬ / ОЧЕРЕДЬ МОДЕРАЦИИ');
    if(!rows.length)console.log('Жалоб пока нет.');
    else console.table(rows);
    console.log('Скрыть: npm run ops -- hide <id> <причина>');
  }else if(command==='hide'||command==='restore'){
    const why=reasonWords.join(' ').trim();
    const result=moderationSet(db,arg,command==='hide'?'hidden':'visible',why);
    console.log(result);
  }else if(command==='report'||!command){
    const numbers={
      savedMutations:count('SELECT COUNT(*) AS n FROM branches WHERE parent_id IS NOT NULL'),
      hiddenBranches:count("SELECT COUNT(*) AS n FROM branches WHERE moderation_status='hidden'"),
      anonymousParticipants:count('SELECT COUNT(DISTINCT creator_session) AS n FROM branches WHERE parent_id IS NOT NULL AND creator_session IS NOT NULL'),
      invitesCreated:count('SELECT COUNT(*) AS n FROM invites'),
      invitesCompleted:count('SELECT COUNT(*) AS n FROM invites WHERE child_id IS NOT NULL'),
      privateWorkspaces:count('SELECT COUNT(*) AS n FROM workspaces'),
      complaints:count('SELECT COUNT(*) AS n FROM branch_reports'),
      verifiedExternalActions:count("SELECT COUNT(*) AS n FROM (SELECT branch_id FROM platform_events UNION SELECT h.branch_id FROM partner_receipts r JOIN handoffs h ON h.id=r.handoff_id WHERE r.environment='live')"),
      sandboxActions:count("SELECT COUNT(DISTINCT h.branch_id) AS n FROM partner_receipts r JOIN handoffs h ON h.id=r.handoff_id WHERE r.environment='sandbox'"),
      handoffsCreated:count('SELECT COUNT(*) AS n FROM handoffs'),
      pendingBusinessBriefs:count("SELECT COUNT(*) AS n FROM brand_submissions WHERE status='pending'"),
      approvedBusinessBriefs:count("SELECT COUNT(*) AS n FROM brand_submissions WHERE status='approved'"),
      rejectedBusinessBriefs:count("SELECT COUNT(*) AS n FROM brand_submissions WHERE status='rejected'"),
      reviewRooms:count('SELECT COUNT(*) AS n FROM review_rooms'),
      privateClientFeedback:count('SELECT COUNT(*) AS n FROM review_feedback'),
      commercialPilotRequests:count('SELECT COUNT(*) AS n FROM pilot_requests'),
      pilotInterestIndications:count("SELECT COUNT(*) AS n FROM pilot_requests WHERE status='accepted'")
    };
    console.log('\nПРОТОКОЛ НУЛЬ / СОСТОЯНИЕ РЕАЛЬНОГО ПРОДУКТА');console.table(numbers);
    const events=db.prepare('SELECT name, source, COUNT(*) AS count, COUNT(DISTINCT session_id) AS people FROM events GROUP BY name,source ORDER BY name').all();
    console.table(events);
    const starts=db.prepare("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE name='interaction_started'").get().n;
    const mutations=db.prepare("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE name='mutation_completed'").get().n;
    const clicked=db.prepare("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE name='product_cta_clicked'").get().n;
    console.log('Начали интерактив:',starts,'; создали публичный результат:',mutations,'; кликнули на продукт:',clicked);
    console.log('Старт → мутация, ориентир:',starts?(100*mutations/starts).toFixed(1)+'%':'нет данных');
    console.log('Платежи не учитываются — платежный провайдер не подключен.');
  }else{
    console.error('Использование: npm run ops -- [report|funnel|funnel-csv ФАЙЛ|experiments|prune [--execute --backup-confirmed]|doctor|commercial-prune [--execute --backup-confirmed]|pilots|pilot-view ID|pilot-review ID причина|pilot-offer ID евроценты причина описание|pilot-decline ID причина|handoffs|briefs|brief-view ID|brief-approve ID причина --manual-review|brief-reject ID причина|brief-unpublish ID причина|brief-republish ID причина|queue|hide ID причина|restore ID причина]');process.exitCode=2;
  }
}catch(error){console.error('Операция не выполнена:',error.message);process.exitCode=1;}
finally{db.close();}
