'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {openDatabase}=require('../src/database');
const {maintenance}=require('../src/maintenance');
test('WAVE 5: expiry dry-run has no side effects; destructive action requires explicit backup confirmation',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-wave5-'));
  const db=openDatabase(path.join(dir,'db.sqlite'));
  try{
    const oldId='unowned-session-old';db.prepare("INSERT INTO sessions(id,created_at,last_seen_at) VALUES(?,datetime('now','-300 days'),datetime('now','-300 days'))").run(oldId);
    const protectedId='protected-session-old';db.prepare("INSERT INTO sessions(id,created_at,last_seen_at) VALUES(?,datetime('now','-300 days'),datetime('now','-300 days'))").run(protectedId);
    db.prepare("INSERT INTO branches(id,campaign_id,parent_id,generation,changed_gene,hook,tone,cta,creator_session) VALUES(?,?,'7F-001-ROOT',1,'hook',?,?,?,?)")
      .run('7F-001-protected','7F-001','Test protected mutation','Деловой','Посмотреть результаты',protectedId);
    db.prepare("INSERT INTO events(name,session_id,created_at) VALUES('portal_view',?,datetime('now','-250 days'))").run(oldId);
    const inviteToken='x'.repeat(32);
    db.prepare("INSERT INTO invites(token,branch_id,creator_session,expires_at) VALUES(?,'7F-001-protected',?,datetime('now','-50 days'))").run(inviteToken,protectedId);
    const pruneHandoff='h'.repeat(32),keepHandoff='k'.repeat(32);
    for(const id of [pruneHandoff,keepHandoff])db.prepare(`INSERT INTO handoffs(id,branch_id,owner_session,platform_key,platform_mode,source,snapshot_json,created_at,expires_at)
      VALUES(?,'7F-001-protected',?,'partner','live','public','{}',datetime('now','-90 days'),datetime('now','-50 days'))`).run(id,protectedId);
    db.prepare("INSERT INTO partner_receipts(platform_key,event_id,handoff_id,action_type,partner_object_id,environment) VALUES('partner','valid-event-protected',?,'artifact_created','object-888','live')").run(keepHandoff);
    const snapshot=maintenance(db);
    assert.equal(snapshot.dryRun,true);assert.equal(snapshot.eligible.oldEvents,1);
    assert.equal(snapshot.eligible.unusedExpiredInvites,1);assert.equal(snapshot.eligible.outdatedHandoffs,1);
    assert.equal(snapshot.eligible.idleUnusedSessions,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);
    assert.throws(()=>maintenance(db,{execute:true}),/резервную/);
    const applied=maintenance(db,{execute:true,confirmBackup:true});assert.equal(applied.dryRun,false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM invites').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM handoffs WHERE id=?').get(pruneHandoff).n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM handoffs WHERE id=?').get(keepHandoff).n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_receipts').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id=?').get(oldId).n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id=?').get(protectedId).n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM branches WHERE id=?').get('7F-001-protected').n,1);
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('WAVE 5: opening older SQLite keeps original branch and adds last_seen safely',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-migrate13-'));
  const filename=path.join(dir,'old.sqlite');
  const {DatabaseSync}=require('node:sqlite');
  let old=new DatabaseSync(filename);
  old.exec("CREATE TABLE sessions(id TEXT PRIMARY KEY,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);INSERT INTO sessions(id) VALUES('legacy-owner');");
  old.close();
  const db=openDatabase(filename);
  try{
    assert.equal(db.prepare("SELECT id FROM sessions WHERE id='legacy-owner'").get().id,'legacy-owner');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('sessions') WHERE name='last_seen_at'").get().n,1);
    assert(db.prepare("SELECT last_seen_at AS t FROM sessions WHERE id='legacy-owner'").get().t);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('campaign_experiments')").get().n>0,true);
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
