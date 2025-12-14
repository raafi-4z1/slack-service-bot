require("dotenv").config();
const { App } = require("@slack/bolt");

const logger = require("../core/logger");
const config = require("../core/config");

const { handleMessageEvent, handleInteraction, cleanupExpiredConfirmations } = require("./handlers");
const { simpleLoopWorker } = require("./workers");

// === CEK ENV WAJIB ===
if (!config.SLACK_BOT_TOKEN) {
  logger.error("❌ SLACK_BOT_TOKEN tidak ditemukan di config. Bot tidak bisa berjalan.");
  process.exit(1);
}

if (!config.SLACK_APP_TOKEN) {
  logger.error("❌ SLACK_APP_TOKEN tidak ditemukan di config. Socket Mode tidak bisa berjalan.");
  process.exit(1);
}

if (!config.JENKINS_URL) {
  logger.error("❌ JENKINS_URL tidak ditemukan di config.");
  process.exit(1);
}

if (!config.JENKINS_USER || !config.JENKINS_TOKEN) {
  logger.warn("⚠️ Jenkins credential kosong, beberapa fitur mungkin gagal.");
  process.exit(1);
}

if (!config.DB_HOST) {
  logger.error("❌ DB_HOST tidak ditemukan di config (dibutuhkan MySQL).");
  process.exit(1);
}

// Bolt-compatible logger wrapper
const boltLogger = {
  debug: (msg) => logger.debug(String(msg)),
  info:  (msg) => logger.info(String(msg)),
  warn:  (msg) => logger.warn(String(msg)),
  error: (msg) => logger.error(String(msg)),
  getLevel: () => logger.level,
  setLevel: (lvl) => { logger.level = lvl }
};

const app = new App({
  token: config.SLACK_BOT_TOKEN,
  appToken: config.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: logger.getLevel().toUpperCase(),
  logger: boltLogger
});

// Events
app.event("app_mention", async ({ event }) => {
  await handleMessageEvent(event);
});

app.action(/.*/, async ({ body, ack }) => {
  await ack();
  await handleInteraction(body);
});

// Cleanup Worker
simpleLoopWorker(() => cleanupExpiredConfirmations(), 5000);

// Start
(async () => {
  try {
    await app.start();
    logger.info("⚡ Slack Socket Mode bot berjalan");
  } catch (err) {
    logger.error("❌ Gagal memulai app Slack", { error: err });
    process.exit(1);
  }
})();
