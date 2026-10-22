'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {loadPlatforms}=require('../src/bridge');
const {openDatabase,getBranch}=require('../src/database');
function fixture(platforms,prod=false){
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'pz-registry-')),file=path.join(d,'p.json');
  fs.writeFileSync(file,JSON.stringify(platforms));process.env.PZ_PLATFORMS_FILE=file;
  try{return loadPlatforms(d,prod);}finally{delete process.env.PZ_PLATFORMS_FILE;fs.rmSync(d,{recursive:true,force:true});}
}
const good=(fields={})=>({key:'site_one',name:'Правдивое название сайта',url:'https://integrated.example/dashboard',mode:'live',secretEnv:'PZ_TEST_REGISTRY_SECRET',capabilities:['brief'],...fields});

test('No external systems appear without operator config; a maximum of seven is enforced',()=>{
  delete process.env.PZ_PLATFORMS_FILE;
  assert.deepEqual(loadPlatforms(process.cwd()),[]);
  assert.throws(()=>fixture(Array.from({length:8},(_,i)=>good({key:'site_'+i}))),/0–7/);
  assert.throws(()=>fixture([good(),good()]),/повторный/);
});

test('Production cannot be configured to call a sandbox, local HTTP, credentials or a dangerous URL',()=>{
  assert.throws(()=>fixture([good({mode:'sandbox'})],true),/Демонстрационную/);
  assert.throws(()=>fixture([good({url:'http://127.0.0.1:9999'})],true),/HTTP разрешён|HTTPS/);
  assert.throws(()=>fixture([good({url:'http://attacker.example'})]),/HTTP разрешён/);
  assert.throws(()=>fixture([good({url:'https://user:password@partner.example'})]),/пароль/);
  assert.throws(()=>fixture([good({url:'javascript:alert(1)'})]),/протокол/);
  assert.throws(()=>fixture([good({secretEnv:'not-env'})]),/secretEnv/);
});

test('Platform HMAC must never live in JSON and short keys are refused',()=>{
  process.env.PZ_TEST_REGISTRY_SECRET='short';
  try{assert.throws(()=>fixture([good()]),/минимум 32/);}
  finally{delete process.env.PZ_TEST_REGISTRY_SECRET;}
  const s=crypto.randomBytes(42).toString('hex');process.env.PZ_TEST_REGISTRY_SECRET=s;
  try{
    const [p]=fixture([good()]);assert.equal(p.secret,s);assert.equal(p.mode,'live');
    assert.equal(p.url,'https://integrated.example/dashboard');
  }finally{delete process.env.PZ_TEST_REGISTRY_SECRET;}
});

test('1.1-shaped database upgrades in place with workspaces and invites unchanged',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pz-migrate-v11-')),file=path.join(dir,'prior.sqlite');
  const legacy=new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE sessions(id TEXT PRIMARY KEY,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE campaigns(id TEXT PRIMARY KEY,title TEXT NOT NULL,brand TEXT NOT NULL,category TEXT NOT NULL,short TEXT NOT NULL,audience TEXT NOT NULL,promise TEXT NOT NULL,evidence TEXT NOT NULL,visual TEXT NOT NULL,accent TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE branches(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),parent_id TEXT REFERENCES branches(id),generation INTEGER NOT NULL,changed_gene TEXT,hook TEXT NOT NULL,tone TEXT NOT NULL,cta TEXT NOT NULL,creator_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,action_status TEXT NOT NULL DEFAULT 'none',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,moderation_status TEXT NOT NULL DEFAULT 'visible');
    CREATE TABLE invites(token TEXT PRIMARY KEY,branch_id TEXT NOT NULL REFERENCES branches(id),creator_session TEXT NOT NULL REFERENCES sessions(id),used_by TEXT,child_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT NOT NULL);
    CREATE TABLE workspaces(branch_id TEXT PRIMARY KEY REFERENCES branches(id),owner_session TEXT NOT NULL REFERENCES sessions(id),headline TEXT NOT NULL,cta TEXT NOT NULL,tone TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO sessions(id) VALUES('existing-user');
    INSERT INTO campaigns(id,title,brand,category,short,audience,promise,evidence,visual,accent) VALUES('user-camp','Campaign','Brand','Work','Example','Audience','Promise','Facts','Visual','#123');
    INSERT INTO branches(id,campaign_id,parent_id,generation,changed_gene,hook,tone,cta,creator_session) VALUES('old-root','user-camp',NULL,0,NULL,'Hello','Спокойный','Read',NULL);
    INSERT INTO branches(id,campaign_id,parent_id,generation,changed_gene,hook,tone,cta,creator_session) VALUES('old-child','user-camp','old-root',1,'hook','Real old copy','Спокойный','Read','existing-user');
    INSERT INTO workspaces(branch_id,owner_session,headline,cta,tone,notes) VALUES('old-child','existing-user','private headline','private CTA','private tone','private notes');
    INSERT INTO invites(token,branch_id,creator_session,expires_at) VALUES('old-unused-token','old-child','existing-user','2027-12-31T00:00:00Z');
  `);
  legacy.close();
  try{
    const migrated=openDatabase(file);
    assert.equal(getBranch(migrated,'old-child').hook,'Real old copy');
    assert.equal(migrated.prepare('SELECT notes FROM workspaces WHERE branch_id=?').get('old-child').notes,'private notes');
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM invites WHERE branch_id=?').get('old-child').n,1);
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM handoffs').get().n,0);
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM partner_receipts').get().n,0);
    migrated.close();
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
