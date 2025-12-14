const logger = require("../core/logger");
const config = require("../core/config");
const permissions = require("../permissions/permissions");

const { sendMessage, updateMessage, postEphemeral, sendToJenkins } = require("../services/api");
const {
  buildConfirmBlocks,
  parseActionValue,
  buildServiceMenu,
  buildServiceStatusMenu,
  buildServiceActionsMenu
} = require("./keyboards");

const {
  SESSION_EXPIRE_SECONDS,
  SERVICES,
} = config;

// ==========================
// GLOBAL SESSION (LOCK)
// ==========================

/**
 * Satu-satunya session global di seluruh bot.
 * Hanya boleh ada SATU sesi aktif di semua channel & user.
 *
 * Struktur:
 * {
 *   id,
 *   trace_id,
 *   initiator,
 *   channel,
 *   ts,
 *   stage,            // "menu" | "service_status" | "service_actions" | "confirm" | "running"
 *   serviceKey,
 *   serviceLabel,
 *   status,
 *   jenkins_job,
 *   action,
 *   created_at,
 *   last_activity_at,
 *   expires_at        // di-refresh setiap aktivitas
 * }
 */
let activeSession = null;
const SESSION_MS = SESSION_EXPIRE_SECONDS * 1000;

/**
 * Menyentuh session (untuk reset SESSION).
 */
function touchSession() {
  if (!activeSession) return;
  const now = Date.now();
  activeSession.last_activity_at = now;
  activeSession.expires_at = now + SESSION_MS;
}

/**
 * Cek apakah session sudah kedaluwarsa.
 */
function isSessionExpired() {
  if (!activeSession) return false;
  return activeSession.expires_at && activeSession.expires_at <= Date.now();
}

/**
 * Hapus session dengan logging.
 */
function clearSession(reason) {
  if (!activeSession) return;
  const snapshot = { ...activeSession };
  logger.info("Menghapus session global", {
    reason,
    channel: snapshot.channel,
    initiator: snapshot.initiator,
    stage: snapshot.stage,
    serviceKey: snapshot.serviceKey,
    action: snapshot.action,
  });
  activeSession = null;
}

/**
 * Dipanggil oleh worker setiap 5 detik.
 * Hanya untuk auto-expire session global.
 */
function cleanupExpiredConfirmations() {
  if (!activeSession) return;

  if (!isSessionExpired()) {
    return;
  }

  const session = { ...activeSession };
  clearSession("expired_by_worker");

  if (session.channel && session.ts) {
    updateMessage(
      session.channel,
      session.ts,
      `⚠️ Sesi otomatis kedaluwarsa setelah ${SESSION_EXPIRE_SECONDS} detik.`,
      []
    ).catch(() => {});
  }
}

// ==========================
// UTIL PROGRESS
// ==========================
async function updateSmoothProgress(channel, ts, percent, action) {
  const filled = Math.floor(percent / 10);
  const empty = 10 - filled;

  const bar = "▓".repeat(filled) + "░".repeat(empty);

  await updateMessage(
    channel,
    ts,
    `⚙️ Menjalankan '/${action}'...\nProgress: [${bar}] ${percent}%`
  );
}

// ==========================
// EVENT: app_mention
// ==========================
async function handleMessageEvent(event) {
  try {
    const channel = event.channel;
    const user = event.user;

    // Cek & auto-expire session jika sudah lewat
    cleanupExpiredConfirmations();

    // Global lock: kalau masih ada session aktif → tolak semua mention
    if (activeSession) {
      logger.warn("Mention ditolak karena sudah ada sesi global aktif", {
        channel_attempt: channel,
        current_session_channel: activeSession.channel,
        initiator: activeSession.initiator,
      });

      await sendMessage(
        channel,
        `⚠️ Saat ini sudah ada sesi aktif di <#${activeSession.channel}> ` +
        `oleh <@${activeSession.initiator}>. ` +
        `Selesaikan sesi tersebut atau tekan *Exit* dulu.`
      );
      return;
    }

    await permissions.loadAll();

    if (!permissions.isChannelAllowed(channel)) {
      logger.debug("Mention di channel yang tidak diizinkan", { channel });
      return;
    }

    if (!permissions.isMentionerAllowed(user)) {
      logger.warn("User tidak diizinkan melakukan mention", { user });
      await sendMessage(
        channel,
        `Maaf <@${user}>, Anda tidak memiliki izin untuk memulai aksi.`
      );
      return;
    }

    const trace_id = logger.wrap("slack_mention", {
      step: "mention_received",
      user,
      channel,
      metadata: { text: event.text }
    });

    // Buat session global baru
    const now = Date.now();
    activeSession = {
      id: `sess_${now}`,
      trace_id,
      initiator: user,
      channel,
      ts: null,
      stage: "menu",
      serviceKey: null,
      serviceLabel: null,
      status: null,
      jenkins_job: null,
      action: null,
      created_at: now,
      last_activity_at: now,
      expires_at: now + SESSION_MS,
    };

    const menuBlocks = buildServiceMenu(SERVICES, user);
    const sent = await sendMessage(channel, "*Pilih Service:*", menuBlocks);

    activeSession.ts = sent.ts;
    touchSession();
  } catch (err) {
    logger.error("Error di handleMessageEvent", { error: err, event });
  }
}

// ==========================
// EVENT: action (button/select)
// ==========================
async function handleInteraction(payload) {
  try {
    const actionObj = payload.actions?.[0];
    if (!actionObj) {
      logger.warn("Payload tanpa actions", { payload });
      return;
    }

    const parsed = parseActionValue(
      actionObj.value || actionObj.selected_option?.value
    );
    const userId = payload.user?.id;
    const channel = payload.channel?.id;
    const ts = payload.message?.ts;

    if (!channel || !userId || !ts) {
      logger.warn("Payload interaction tidak lengkap", { channel, userId, ts, parsed });
      return;
    }

    // await permissions.loadAll();
    // Auto-expire kalau perlu
    cleanupExpiredConfirmations();

    // Tidak ada session aktif → tolak semua interaksi
    if (!activeSession) {
      logger.warn("Interaksi tanpa session aktif", { channel, userId, parsed });
      await postEphemeral(
        channel,
        userId,
        "⚠️ Tidak ada sesi aktif. Silakan mention bot lagi untuk memulai sesi baru."
      );
      return;
    }

    // Pastikan interaksi ini memang milik sesi yang sedang aktif
    if (channel !== activeSession.channel || ts !== activeSession.ts) {
      logger.warn("Interaksi tidak cocok dengan session aktif", {
        session_channel: activeSession.channel,
        session_ts: activeSession.ts,
        interaction_channel: channel,
        interaction_ts: ts,
        userId,
        parsed,
      });
      await postEphemeral(
        channel,
        userId,
        "⚠️ Sesi ini tidak lagi berlaku untuk interaksi ini. Silakan mulai sesi baru dengan mention bot."
      );
      return;
    }

    if (!permissions.isAllowedUser(userId)) {
      await postEphemeral(channel, userId, "Maaf, Anda tidak memiliki izin untuk menjalankan aksi ini.");
      return;
    }

    logger.wrap("slack_interaction", {
      trace_id: activeSession.trace_id,
      step: parsed.type,
      user: userId,
      channel,
      service: parsed.service_key,
      action: parsed.action,
      metadata: { parsed }
    });

    touchSession();

    // ==========================
    // ALUR MENU
    // ==========================

    // SELECT SERVICE → cek status service dari Jenkins
    if (parsed.type === "select_service") {
      const service = SERVICES.find((s) => s.key === parsed.service_key);
      if (!service) {
        logger.warn("Service tidak ditemukan saat select_service", { parsed });
        await postEphemeral(channel, userId, "Service tidak ditemukan.");
        return;
      }

      activeSession.stage = "service_status";
      activeSession.serviceKey = service.key;
      activeSession.serviceLabel = service.label;
      activeSession.jenkins_job = service.jenkins_job;
      touchSession();

      // ⏳ tampilkan loading agar user tahu sedang proses
      await updateMessage(channel, ts, `⏳ Memeriksa status *${service.label}* dari Jenkins...`);

      // 🔥 trigger Jenkins STATUS build
      const trigger = await sendToJenkins({
        mode: "__trigger__",
        jenkinsJob: service.jenkins_job,
        action: "status",
        slackChannel: channel,
        slackTs: ts
      });

      // 🔥 tunggu Jenkins sampai selesai
      await sendToJenkins({
        mode: "__wait_build__",
        jenkinsJob: service.jenkins_job,
        action: "status",
        buildNumber: trigger.buildNumber,
        traceId: activeSession.trace_id
      });

      // 🔥 ambil hasil final STATUS
      const status = await sendToJenkins({
        mode: "__get_log__",
        jenkinsJob: service.jenkins_job,
        action: "status",
        buildNumber: trigger.buildNumber
      });

      activeSession.status = status;
      touchSession();

      // tampilkan menu status
      return updateMessage(channel, ts, "", buildServiceStatusMenu(service, status, userId));
    }

    // OPEN ACTIONS
    if (parsed.type === "open_actions") {
      const service = SERVICES.find((s) => s.key === parsed.service_key);
      if (!service) {
        await postEphemeral(channel, userId, "Service tidak ditemukan.");
        return;
      }
      const st = activeSession.status || "unknown";

      activeSession.stage = "service_actions";
      activeSession.serviceKey = service.key;
      activeSession.serviceLabel = service.label;
      activeSession.jenkins_job = service.jenkins_job;
      touchSession();

      return updateMessage(channel, ts, "", buildServiceActionsMenu(service, st, userId));
    }

    // BACK BUTTON
    if (parsed.type === "back") {
      // BACK ke menu utama (service list)
      if (parsed.target === "service_list") {
        activeSession.stage = "menu";
        activeSession.serviceKey = null;
        activeSession.serviceLabel = null;
        activeSession.status = null;
        activeSession.jenkins_job = null;
        activeSession.action = null;
        touchSession();

        return updateMessage(channel, ts, "", buildServiceMenu(SERVICES, userId));
      }

      // BACK ke status service
      if (parsed.target === "service_status") {
        const service = SERVICES.find(s => s.key === activeSession.serviceKey);
        const st = activeSession.status || "unknown";

        activeSession.stage = "service_status";
        touchSession();

        return updateMessage(channel, ts, "", buildServiceStatusMenu(service, st, userId));
      }

      logger.warn("Back target tidak dikenali", { parsed });
      return;
    }

    // EXIT → hapus session global
    if (parsed.type === "exit") {
      const snapshot = { ...activeSession };
      clearSession("user_exit");
      return updateMessage(channel, ts, "❌ Aksi dibatalkan.", []);
    }

    // ==========================
    // EKSEKUSI ACTION (start/stop/restart)
    // ==========================

    // EXECUTE ACTION → tampilkan konfirmasi
    if (parsed.type === "action_exec") {
      const service = SERVICES.find((s) => s.key === parsed.service_key);
      if (!service) {
        await postEphemeral(channel, userId, "Service tidak ditemukan.");
        return;
      }

      activeSession.stage = "confirm";
      activeSession.action = parsed.action;
      activeSession.serviceKey = service.key;
      activeSession.serviceLabel = service.label;
      activeSession.jenkins_job = service.jenkins_job;
      touchSession();

      const confirmBlocks = buildConfirmBlocks(parsed.action, service.key, `<@${activeSession.initiator}>`);
      return updateMessage(channel, ts, "", confirmBlocks);
    }

    // CONFIRM YES / NO
    if (parsed.type === "confirm_yes" || parsed.type === "confirm_no") {
      const session = activeSession;
      if (!session || session.stage !== "confirm") {
        await postEphemeral(channel, userId, "Tidak ada konfirmasi aktif.");
        return;
      }

      // Cek expiry satu kali lagi
      if (isSessionExpired()) {
        const snap = { ...session };
        clearSession("confirm_expired");

        if (snap.channel && snap.ts) {
          await updateMessage(snap.channel, snap.ts, `⚠️ Konfirmasi untuk '/${snap.action}' kadaluwarsa.`, []);
        }
        return;
      }
      
      if (!permissions.isApprovalUser(userId)) {
        await postEphemeral(channel, userId,
          "⛔ Anda tidak memiliki izin untuk menyetujui atau menolak aksi ini.");
        return;
      }

      // ❌ NO
      if (parsed.type === "confirm_no") {
        const snap = { ...session };
        clearSession("user_cancel");

        await updateMessage(channel, snap.ts, `❌ Aksi '/${snap.action}' dibatalkan oleh <@${userId}>.`, []);
        return;
      }

      // ✔ YES
      const initiator = session.initiator;
      const service_label = session.serviceLabel;
      const action = session.action;
      const jenkins_job = session.jenkins_job;

      await updateMessage(channel, session.ts, `⚙️ <@${userId}> mengkonfirmasi. Menjalankan '/${action}'...`);
      try {
        // 1️⃣ Trigger Jenkins → dapat buildNumber
        const trigger = await sendToJenkins({
          mode: "__trigger__",
          jenkinsJob: jenkins_job,
          action: action,
          slackChannel: channel,
          slackTs: ts
        });
        const { buildNumber } = trigger;

        // 2️⃣ Progress bar
        let percent = 2;
        let done = false;

        while (!done && percent < 95) {
          await new Promise(r => setTimeout(r, 500));
          percent += 2;

          // update progress visual
          await updateSmoothProgress(channel, session.ts, percent, action);

          // cek apakah Jenkins sudah selesai
          done = await sendToJenkins({
            mode: "__is_build_done__",
            jenkinsJob: jenkins_job,
            action: action,
            buildNumber: buildNumber
          });
          if (done) break; // SELESAI → hentikan progress
        }
        // 3️⃣ Tunggu Jenkins benar-benar SELESAI
        await sendToJenkins({
          mode: "__wait_build__",
          jenkinsJob: jenkins_job,
          action: action,
          buildNumber: buildNumber,
          traceId: activeSession.trace_id
        });

        // 4️⃣ progress 100%
        await updateSmoothProgress(channel, session.ts, 100, action);

        // 4️⃣ Ambil log final
        const finalOutput = await sendToJenkins({
          mode: "__get_log__",
          jenkinsJob: jenkins_job,
          action: action,
          buildNumber: buildNumber
        });

        // 5️⃣ Mapping hasil
        let actionLabel = "";
        if (finalOutput === "stopped") actionLabel = "berhasil *STOP*";
        else if (finalOutput === "running" || finalOutput === "started") actionLabel = "berhasil *START*";
        else actionLabel = "berhasil dijalankan";
        
        logger.wrap("service_action", {
          trace_id: session.trace_id,
          step: "action_success",
          user: userId,
          service: service_label,
          action,
          status: finalOutput,
          metadata: {
            confirmed_by: userId,
            initiated_by: initiator
          }
        });

        await updateMessage(
          channel,
          session.ts,
          `✅ Aksi '/${action}' untuk *${service_label}* ${actionLabel}.\n\n` +
          `• Diinisiasi oleh: <@${initiator}>\n` +
          `• Dikonfirmasi oleh: <@${userId}>\n` +
          `• Status akhir: *${finalOutput}*`,
          []
        );
        clearSession("completed");
      } catch (err) {
        logger.wrap("service_action", {
          trace_id: session.trace_id,
          step: "action_failed",
          user: userId,
          service: service_label,
          action: session.action,
          error: err?.message || String(err),
        });

        await updateMessage(
          channel,
          session.ts,
          `❌ Aksi '/${session.action}' gagal: ${err?.message || err}`,
          []
        );
        clearSession("failed");
      }

      return;
    }

    // FALLBACK
    logger.debug("Interaction type tidak dikenali", { parsed });
  } catch (err) {
    clearSession("handleInteraction_error");
    logger.error("Error di handleInteraction", { error: err, payload });
  }
}

module.exports = {
  handleMessageEvent,
  handleInteraction,
  cleanupExpiredConfirmations,
};
