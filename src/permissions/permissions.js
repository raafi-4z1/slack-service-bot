const { getActiveChannelIds, getActiveMentioners, getActiveUsers } = require("./permissionsRepo");
const logger = require("../core/logger");

const CACHE = {
  CHANNEL_IDS: new Set(),
  ALLOWED_MENTIONERS: new Set(),
  ALLOWED_USERS: new Set(),
  APPROVAL_USERS: new Set(),
  lastRefreshedAt: null
};


async function loadAll() {
  try {
    const [channels, mentioners, users, approvers] = await Promise.all([
      getActiveChannelIds(),
      getActiveMentioners(),
      getActiveUsers(),
      getApprovalUsers(),
    ]);

    CACHE.CHANNEL_IDS = new Set(channels || []);
    CACHE.ALLOWED_MENTIONERS = new Set(mentioners || []);
    CACHE.ALLOWED_USERS = new Set(users || []);
    CACHE.APPROVAL_USERS = new Set(approvers || []);
    CACHE.lastRefreshedAt = Date.now();

    logger.info('Permissions cache refreshed', {
      channels: CACHE.CHANNEL_IDS.size,
      mentioners: CACHE.ALLOWED_MENTIONERS.size,
      users: CACHE.ALLOWED_USERS.size,
      approvers: CACHE.APPROVAL_USERS.size,
      lastRefreshedAt: CACHE.lastRefreshedAt,
    });
  } catch (err) {
    logger.error('Failed to load permissions from DB', { error: err });
    throw err;
  }
}

function isChannelAllowed(ch) {
  return CACHE.CHANNEL_IDS.size !== 0 && CACHE.CHANNEL_IDS.has(ch);
}

function isMentionerAllowed(uid) {
  return CACHE.ALLOWED_MENTIONERS.size !== 0 && CACHE.ALLOWED_MENTIONERS.has(uid);
}

function isAllowedUser(uid) {
  return CACHE.ALLOWED_USERS.size !== 0 && CACHE.ALLOWED_USERS.has(uid);
}

function isApprovalUser(uid) {
  return CACHE.APPROVAL_USERS.size !== 0 && CACHE.APPROVAL_USERS.has(uid);
}

module.exports = {
  loadAll,
  isChannelAllowed,
  isMentionerAllowed,
  isAllowedUser,
  isApprovalUser,
};
