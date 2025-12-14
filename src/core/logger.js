const { existsSync, mkdirSync } = require("fs");
const { join } = require("path");
const { createLogger, format, transports } = require("winston");
const { red, yellow, green, blue } = require("chalk");
const config = require("./config");
const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();

const logDir = config.LOG_DIR;
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

const logFile = join(
  logDir,
  `botlog-${new Date().toISOString().slice(0, 10)}.log`
);

const logger = createLogger({
  level: config.LOG_LEVEL,
  transports: [
    new transports.Console({
      level: config.LOG_LEVEL,
      format: format.combine(
        format.timestamp({
          format: () => {
            return new Date().toLocaleString("en-CA", {
              timeZone: config.TZ,
              hour12: false
            });
          }
        }),
        format.printf(({ level, message, timestamp }) => {
          const colors = { error: red, warn: yellow, info: green, debug: blue };
          return colors[level](`[${level.toUpperCase()}]`) + ` ${timestamp} ${message}`;
        })
      ),
    }),
    new transports.File({
      level: config.LOG_LEVEL,
      filename: logFile,
      format: format.combine(
        format.timestamp({
          format: () => {
            return new Date().toLocaleString("en-CA", {
              timeZone: config.TZ,
              hour12: false
            });
          }
        }),
        format.errors({ stack: true }),
        format.json()
      ),
    }),
  ],
});

logger.wrap = function (event, data = {}, level = "info") {
  const payload = {
    trace_id: data.trace_id || uuidv4(),
    event,
    step: data.step || null,
    user: data.user || null,
    channel: data.channel || null,
    service: data.service || null,
    action: data.action || null,
    status: data.status || "OK",
    metadata: data.metadata || null,
  };

  logger[level](JSON.stringify(payload));
  return payload.trace_id;
};

logger.newTrace = () => uuidv4();
logger.getLevel = () =>
  logger.transports[0]?.level || logger.level || config.LOG_LEVEL;
logger.setLevel = (lvl) => { logger.level = lvl };

module.exports = logger;
