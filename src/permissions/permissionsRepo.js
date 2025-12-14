const db = require("../db/db");

async function getActiveChannelIds() {
  const [rows] = await db.query(
    `SELECT channel_id FROM channel_ids WHERE deleted_at IS NULL`
  );
  return rows.map(r => r.channel_id);
}

async function getActiveMentioners() {
  const [rows] = await db.query(
    `SELECT user_id FROM allowed_mentioners WHERE deleted_at IS NULL`
  );
  return rows.map(r => r.user_id);
}

async function getActiveUsers() {
  const [rows] = await db.query(
    `SELECT user_id FROM allowed_users WHERE deleted_at IS NULL`
  );
  return rows.map(r => r.user_id);
}

async function getApprovalUsers() {
  const [rows] = await db.query(
    `SELECT user_id FROM approval_users WHERE deleted_at IS NULL`
  );
  return rows.map(r => r.user_id);
}


module.exports = {
  getActiveChannelIds,
  getActiveMentioners,
  getActiveUsers,
  getApprovalUsers,
};
