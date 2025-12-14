const { WebClient } = require("@slack/web-api");
const axios = require("axios");
const config = require("../core/config");
const logger = require("../core/logger");

const slack = new WebClient(config.SLACK_BOT_TOKEN);

function getAuth() {
  if (config.JENKINS_USER && config.JENKINS_TOKEN) {
    return {
      username: config.JENKINS_USER,
      password: config.JENKINS_TOKEN
    };
  }
  return undefined;
}

async function sendMessage(channel, text, blocks) {
  try {
    const res = await slack.chat.postMessage({
      channel,
      text: text || " ",
      blocks: blocks || undefined,
    });
    logger.info("Slack sendMessage sukses", { channel, ts: res.ts });
    return res;
  } catch (err) {
    logger.error("Slack sendMessage gagal", { error: err, channel, text });
    throw err;
  }
}

async function updateMessage(channel, ts, text, blocks) {
  try {
    const res = await slack.chat.update({
      channel,
      ts,
      text: text || " ",
      blocks: blocks || undefined,
    });
    logger.info("Slack updateMessage sukses", { channel, ts });
    return res;
  } catch (err) {
    logger.error("Slack updateMessage gagal", { error: err, channel, ts });
    throw err;
  }
}

async function postEphemeral(channel, user, text) {
  try {
    const res = await slack.chat.postEphemeral({
      channel,
      user,
      text,
    });
    logger.info("Slack postEphemeral sukses", { channel, user });
    return res;
  } catch (err) {
    logger.error("Slack postEphemeral gagal", { error: err, channel, user });
  }
}

async function sendToJenkins({
  mode,
  jenkinsJob,
  action,
  buildNumber = null,
  traceId = null,
  slackChannel = null,
  slackTs = null
}) {
  const base = `${config.JENKINS_URL}/job/${jenkinsJob}`;
  const auth = { auth: getAuth(), timeout: 20000 };

  // ---------------------------------------------------------
  // CEK CEPAT — apakah Jenkins sudah selesai?
  // ---------------------------------------------------------
  if (mode === "__is_build_done__") {
    try {
      const info = await axios.get(`${base}/${buildNumber}/api/json`, auth);
      return info.data.building === false;
    } catch (err) {
      logger.error("Jenkins __is_build_done__ error", { error: err });
      return false;
    }
  }

  // ---------------------------------------------------------
  // CHECK STATUS — menjalankan Jenkins ACTION=status
  // ---------------------------------------------------------
  // if (mode === "check_status") {
  //   try {
  //     // trigger pipeline status
  //     const trigger = await sendToJenkins("__trigger__", jenkinsJob, "status");
  //     // tunggu pipeline selesai
  //     await sendToJenkins("__wait_build__", jenkinsJob, "status", trigger.buildNumber);
  //     // ambil log final
  //     const log = await sendToJenkins("__get_log__", jenkinsJob, "status", trigger.buildNumber);

  //     const lower = log.toLowerCase();
  //     if (lower.includes("running") || lower.includes("started")) return "running";
  //     if (lower.includes("stopped")) return "stopped";
  //     return "unknown";

  //   } catch (err) {
  //     logger.error("check_status error", { error: err });
  //     return "unknown";
  //   }
  // }

  // ---------------------------------------------------------
  // TRIGGER BUILD (kembalikan buildNumber)
  // ---------------------------------------------------------
  if (mode === "__trigger__") {
    try {
      const res = await axios.post(
        `${base}/buildWithParameters?ACTION=${action}`,
        {},
        auth
      );

      const queueUrl = res.headers.location;
      if (!queueUrl) throw new Error("Queue URL tidak ditemukan");

      let buildNo = null;
      let queueNotified = false;     // hanya kirim Slack/log sekali
      const maxWaitMs = 180000;      // 3 menit
      const intervalMs = 700;
      const maxLoop = Math.floor(maxWaitMs / intervalMs);

      for (let i = 0; i < maxLoop; i++) {
        await new Promise(r => setTimeout(r, intervalMs));
        const q = await axios.get(queueUrl + "api/json", auth);

        // ❗ Masih dalam queue
        if (!q.data?.executable) {

          if (!queueNotified) {
            queueNotified = true;

            logger.info("Jenkins job masuk dalam queue", {
              jenkinsJob,
              action,
              queueUrl
            });

            // Jika ACTION=status → tanpa progress bar
            if (slackChannel && slackTs) {
              if (action === "status") {
                await updateMessage(slackChannel, slackTs, `⏳ Job sedang berada dalam *antrian Jenkins*. Menunggu executor...`);
              } else {
                await updateMessage(
                  slackChannel,
                  slackTs,
                  `⏳ Job sedang berada dalam *antrian Jenkins*. Menunggu executor...\nProgress: [░░░░░░░░░░] 2%`
                );
              }
            }
          }
          continue;
        }

        // Keluar dari Queue → buildNumber siap
        buildNo = q.data.executable.number;

        logger.info("Jenkins job keluar dari queue dan mulai berjalan", {
          jenkinsJob,
          action,
          buildNumber: buildNo,
        });

        if (slackChannel && slackTs) {
          if (action === "status") {
            await updateMessage(slackChannel, slackTs, `🚀 Job mulai dijalankan di Jenkins (Build #${buildNo})`);
          } else {
            await updateMessage(slackChannel, slackTs, `🚀 Job mulai dijalankan di Jenkins (Build #${buildNo})\nProgress: [░░░░░░░░░░] 2%`);
          }
        }
        break;
      }

      if (!buildNo) {
        // 🔥 Ambil queueId dari queueUrl
        const queueIdMatch = queueUrl.match(/item\/(\d+)/);
        const queueId = queueIdMatch ? queueIdMatch[1] : null;

        // ❌ Cancel queue jika queueId ditemukan
        if (queueId) {
          try {
            await axios.post(
              `${config.JENKINS_URL}/queue/cancelItem?id=${queueId}`,
              {},
              auth
            );

            logger.warn("Jenkins queue dibatalkan karena timeout", {
              jenkinsJob,
              action,
              queueId,
              timeoutMs: maxWaitMs
            });
          } catch (cancelErr) {
            logger.error("Gagal membatalkan queue Jenkins", {
              error: cancelErr,
              queueId
            });
          }
        }

        // 🔥 Notifikasi Slack bahwa job dibatalkan
        if (slackChannel && slackTs) {
          await updateMessage(slackChannel, slackTs, `❌ Job *dibatalkan* karena terlalu lama menunggu di antrian Jenkins.`);
        }
        // ❌ Cancel di sisi bot
        throw new Error("Request dibatalkan: terlalu lama menunggu di queue Jenkins.");
      }

      return { buildNumber: buildNo };
    } catch (err) {
      logger.error("Jenkins __trigger__ error", { error: err });
      throw err;
    }
  }

  // ---------------------------------------------------------
  // WAIT BUILD — menunggu Jenkins pipeline selesai
  // ---------------------------------------------------------
  if (mode === "__wait_build__") {
    try {
      // Polling sampai Jenkins selesai (building=false)
      for (let i = 0; i < 60; i++) {  // max 30 detik (60 × 500ms)
        await new Promise(r => setTimeout(r, 500));

        const info = await axios.get(`${base}/${buildNumber}/api/json`, auth);

        // Jika sudah selesai → break
        if (info.data?.building === false) {
          logger.wrap("jenkins_build_finished", {
            trace_id: traceId,
            step: "jenkins_wait_finish",
            service: jenkinsJob,
            action,
            metadata: {
              buildNumber,
              result: info.data.result
            }
          });
          break;
        }
      }

      return true;

    } catch (err) {
      logger.error("Jenkins __wait_build__ error", { error: err });
      throw err;
    }
  }

  // ---------------------------------------------------------
  // AMBIL FINAL LOG KETIKA SELESAI
  // ---------------------------------------------------------
  if (mode === "__get_log__") {
    try {
      const res = await axios.get(`${base}/${buildNumber}/consoleText`, auth);

      const raw = res.data || "";
      const lower = raw.toLowerCase();

      logger.info("Jenkins pipeline log", {
        jenkinsJob,
        action,
        buildNumber,
        log: raw.substring(raw.length - 2000)
      });

      // 1. Jika Jenkins kirim HTML → bukan log valid
      if (lower.includes("<html") || lower.trim() === "ok") {
        return "unknown";
      }

      // 2. Split baris log dari akhir → mencari status service asli
      const lines = raw
        .split("\n")
        .map(l => l.trim())
        .filter(l =>
          l &&
          !l.toLowerCase().startsWith("started by") &&
          !l.startsWith("[Pipeline]") &&
          !l.startsWith("Running on ") &&
          !l.toLowerCase().includes("found a jenkins") &&
          !l.toLowerCase().includes("finished")
        );

      // Cari baris status asli ("running", "started", "stopped"), HARUS berdiri sendiri
      for (let i = lines.length - 1; i >= 0; i--) {
        const ln = lines[i].toLowerCase();
        if (ln === "running") return "running";
        if (ln === "started") return "started";
        if (ln === "stopped") return "stopped";
      }

      // 3. Kalau tidak ketemu tapi ada 'done' → status STOP
      if (lower.includes("\ndone")) return "stopped";

      return "unknown";
    } catch (err) {
      logger.error("Jenkins __get_log__ error", { error: err });
      throw err;
    }
  }

  throw new Error(`Invalid Jenkins mode: ${mode}`);
}

module.exports = {
  sendToJenkins,
  slackClient: slack,
  sendMessage,
  updateMessage,
  postEphemeral,
};
