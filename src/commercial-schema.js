'use strict';
// The second five waves are additive and preserve all v1.8 tables.
function migrateCommercial(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_rooms (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
      owner_session TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_review_rooms_submission ON review_rooms(submission_id,created_at);
    CREATE TABLE IF NOT EXISTS review_feedback (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES review_rooms(id) ON DELETE CASCADE,
      branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      visitor_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      decision TEXT NOT NULL DEFAULT 'new' CHECK(decision IN ('new','considered','rejected')),
      owner_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      UNIQUE(room_id,branch_id,visitor_session)
    );
    CREATE INDEX IF NOT EXISTS idx_review_feedback_room ON review_feedback(room_id,created_at);
    CREATE TABLE IF NOT EXISTS review_decision_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id TEXT NOT NULL REFERENCES review_feedback(id) ON DELETE CASCADE,
      decision TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS pilot_requests (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
      owner_session TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      objective TEXT NOT NULL,
      budget_band TEXT NOT NULL CHECK(budget_band IN ('unknown','under_500','500_2000','2000_plus')),
      status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','reviewing','proposal_sent','accepted','declined','withdrawn')),
      proposal TEXT NOT NULL DEFAULT '',
      quote_eur_cents INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pilot_submission ON pilot_requests(submission_id,created_at);
    CREATE TABLE IF NOT EXISTS pilot_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pilot_id TEXT NOT NULL REFERENCES pilot_requests(id) ON DELETE CASCADE,
      actor TEXT NOT NULL CHECK(actor IN ('operator','owner')),
      old_status TEXT,
      new_status TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
module.exports={migrateCommercial};
