'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {openDatabase,getBranch}=require('../src/database');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('Existing v1.2 SQLite campaigns, children, handoffs and invites survive the v1.3 migration',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz13-legacy-v12-'));
  const file=path.join(dir,'upgrade.sqlite');
  const legacy=new DatabaseSync(file);
  legacy.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE sessions(id TEXT PRIMARY KEY,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE campaigns(id TEXT PRIMARY KEY,title TEXT NOT NULL,brand TEXT NOT NULL,category TEXT NOT NULL,
      short TEXT NOT NULL,audience TEXT NOT NULL,promise TEXT NOT NULL,evidence TEXT NOT NULL,visual TEXT NOT NULL,
      accent TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE branches(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),parent_id TEXT REFERENCES branches(id),
      generation INTEGER NOT NULL,changed_gene TEXT,hook TEXT NOT NULL,tone TEXT NOT NULL,cta TEXT NOT NULL,
      creator_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,action_status TEXT NOT NULL DEFAULT 'none',
      moderation_status TEXT NOT NULL DEFAULT 'visible',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE invites(token TEXT PRIMARY KEY,branch_id TEXT NOT NULL REFERENCES branches(id),
      creator_session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,used_by TEXT,child_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT NOT NULL);
    CREATE TABLE handoffs(id TEXT PRIMARY KEY,branch_id TEXT NOT NULL REFERENCES branches(id),
      owner_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,platform_key TEXT NOT NULL,platform_mode TEXT NOT NULL,
      source TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,
      opened_at TEXT,resolved_at TEXT,revoked_at TEXT);
  `);
  legacy.prepare('INSERT INTO sessions(id) VALUES(?)').run('legacy-owner-0001');
  legacy.prepare(`INSERT INTO campaigns(id,title,brand,category,short,audience,promise,evidence,visual,accent)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run('OLD-042','Кампания старой версии','PREVIOUS BRAND','Услуги','Старая кампания для безопасного теста миграции','Старые клиенты','Показать существующий продукт','Факты требуют проверки','Светлый макет','#abcdef');
  legacy.prepare('INSERT INTO branches(id,campaign_id,parent_id,generation,hook,tone,cta) VALUES(?,?,NULL,0,?,?,?)')
    .run('OLD-042-ROOT','OLD-042','Первый старый заголовок','Деловой','Посмотреть продукт');
  legacy.prepare('INSERT INTO branches(id,campaign_id,parent_id,generation,changed_gene,hook,tone,cta,creator_session) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('OLD-042-CHILD','OLD-042','OLD-042-ROOT',1,'hook','Новый заголовок из старой версии','Деловой','Посмотреть продукт','legacy-owner-0001');
  legacy.prepare('INSERT INTO invites(token,branch_id,creator_session,expires_at) VALUES(?,?,?,?)')
    .run('i'.repeat(32),'OLD-042-CHILD','legacy-owner-0001','2030-12-12T12:00:00.000Z');
  legacy.prepare('INSERT INTO handoffs(id,branch_id,owner_session,platform_key,platform_mode,source,snapshot_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('h'.repeat(32),'OLD-042-CHILD','legacy-owner-0001','demo_lab','sandbox','public','{"format":"legacy"}','2026-10-01T10:00:00.000Z','2026-11-01T10:00:00.000Z');
  legacy.close();
  const db=openDatabase(file);
  try{
    assert.equal(getBranch(db,'OLD-042-CHILD').hook,'Новый заголовок из старой версии');
    assert.equal(getBranch(db,'OLD-042-ROOT').origin,'demo','unknown legacy brands are never auto-labelled verified');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM invites WHERE token=?').get('i'.repeat(32)).n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM handoffs WHERE id=?').get('h'.repeat(32)).n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM brand_submissions').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM branches WHERE parent_id IS NULL').get().n,4,'three demo seeds plus old original');
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
