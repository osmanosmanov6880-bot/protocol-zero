'use strict';
// v2.8.0: additive tables only. Existing campaigns, branches, reviews, and pilots are retained.
function migrateWaves1115(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_controls (
      campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paused')),
      reason TEXT NOT NULL DEFAULT '',
      updated_by TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS campaign_control_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      previous TEXT NOT NULL,new_status TEXT NOT NULL,
      reason TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_campaign_control_log ON campaign_control_log(campaign_id,id);
    CREATE TABLE IF NOT EXISTS creative_packs (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
      owner_session TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('internal','client_review','experiment')),
      snapshot_json TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_packs_submission ON creative_packs(submission_id,created_at);
    CREATE TABLE IF NOT EXISTS experiment_closures (
      experiment_id TEXT PRIMARY KEY REFERENCES campaign_experiments(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      closed_by TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS pilot_milestones (
      id TEXT PRIMARY KEY,
      pilot_id TEXT NOT NULL REFERENCES pilot_requests(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','submitted','acknowledged','changes_requested')),
      owner_note TEXT NOT NULL DEFAULT '',
      submitted_at TEXT,reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pilot_milestones ON pilot_milestones(pilot_id,created_at);
    CREATE TABLE IF NOT EXISTS pilot_milestone_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      milestone_id TEXT NOT NULL REFERENCES pilot_milestones(id) ON DELETE CASCADE,
      actor TEXT NOT NULL CHECK(actor IN ('owner','operator')),
      from_status TEXT,to_status TEXT NOT NULL,detail TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
module.exports={migrateWaves1115};
