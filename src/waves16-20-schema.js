'use strict';
// Additive migrations for WAVES 16-20: team access, deliverables, evidence, trace audit.
function migrateWaves1620(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_invitations (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
      inviter_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      token_hash TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('viewer','reviewer')),
      expires_at TEXT NOT NULL,
      redeemed_at TEXT,redeemed_by TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_team_invites_sub ON team_invitations(submission_id,created_at);
    CREATE TABLE IF NOT EXISTS team_members (
      submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
      member_session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('viewer','reviewer')),
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(submission_id,member_session)
    );
    CREATE TABLE IF NOT EXISTS team_notes (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
      pack_id TEXT NOT NULL REFERENCES creative_packs(id) ON DELETE CASCADE,
      author_session TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_team_notes_sub ON team_notes(submission_id,id);
    CREATE TABLE IF NOT EXISTS campaign_deliverables (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
      pack_id TEXT NOT NULL REFERENCES creative_packs(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_deliverables_sub ON campaign_deliverables(submission_id,created_at);
    CREATE TABLE IF NOT EXISTS evidence_dossiers (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
      snapshot_json TEXT NOT NULL,sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_evidence_sub ON evidence_dossiers(submission_id,created_at);
    CREATE TABLE IF NOT EXISTS commercial_audit (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES brand_submissions(id) ON DELETE CASCADE,
      action TEXT NOT NULL,subject_id TEXT NOT NULL,
      previous_hash TEXT NOT NULL,sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_commercial_audit_sub ON commercial_audit(submission_id,created_at);
  `);
}
module.exports={migrateWaves1620};
