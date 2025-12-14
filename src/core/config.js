require("dotenv").config();
const { env } = process;

module.exports = {
  // Slack
  SLACK_BOT_TOKEN: env.SLACK_BOT_TOKEN || "",
  SLACK_APP_TOKEN: env.SLACK_APP_TOKEN || "",

  // Log directory
  LOG_DIR: env.LOG_DIR || "logs",
  LOG_LEVEL: env.LOG_LEVEL || "info",
  TZ: env.TZ || "Asia/Jakarta",

  // DB
  DB_HOST: env.DB_HOST,
  DB_USER: env.DB_USER,
  DB_PASSWORD: env.DB_PASSWORD,
  DB_PORT: Number(env.DB_PORT || 3306),
  DB_NAME: env.DB_NAME,

  // TTL
  SESSION_EXPIRE_SECONDS: Number(env.SESSION_EXPIRE_SECONDS || 45),

  // Service definitions
  SERVICES: [
    { key: "elasticsearch", label:"Elasticsearch", icon:"🟦", jenkins_job:"Service-Elasticsearch" },
    { key: "kibana",        label:"Kibana",        icon:"🟪", jenkins_job:"Service-Kibana" },
    { key: "filebeat",      label:"Filebeat",      icon:"🟧", jenkins_job:"Service-Filebeat" }
  ],

  // Jenkins
  JENKINS_URL: env.JENKINS_URL || "",
  JENKINS_USER: env.JENKINS_USER || "",
  JENKINS_TOKEN: env.JENKINS_TOKEN || "",
};
