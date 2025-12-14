function buildConfirmBlocks(action, serviceKey, initiatorTag) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
`⚠️ Konfirmasi untuk '/${action}:${serviceKey}'
Diminta oleh: ${initiatorTag ? initiatorTag : "<unknown>"}
Tekan *Ya* untuk melanjutkan.`
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "Ya" },
          value: `confirm_yes:${action}:${serviceKey}`,
        },
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "Tidak" },
          value: `confirm_no:${action}:${serviceKey}`,
        },
      ],
    },
  ];
}

function parseActionValue(value) {
  const parts = value.split(":");
  const kind = parts[0];

  if (kind === "select_service") {
    return {
      type: "select_service",
      service_key: parts[1],
      initiator_id: parts[2]
    };
  }

  if (kind === "open_actions") {
    return {
      type: "open_actions",
      service_key: parts[1],
      initiator_id: parts[2]
    };
  }

  if (kind === "action_exec") {
    return {
      type: "action_exec",
      action: parts[1],
      service_key: parts[2],
      initiator_id: parts[3]
    };
  }

  if (kind === "confirm_yes" || kind === "confirm_no") {
    return {
      type: kind,
      action: parts[1],
      service_key: parts[2],
      initiator_id: parts[3]
    };
  }

  if (kind === "back") {
    return {
      type: "back",
      target: parts[1],              // "service_list" | "service_status"
      service_key: parts[2] || null, // hanya ada jika from service_status
      initiator_id: parts[3] || null
    };
  }

  if (kind === "exit") {
    return { type: "exit", initiator_id: parts[1] };
  }

  return null;
}

function buildServiceMenu(services, initiatorId) {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Pilih Service:*" },
    },
    {
      type: "actions",
      elements: [
        ...services.map((svc) => ({
          type: "button",
          text: { type: "plain_text", text: `${svc.icon} ${svc.label}` },
          value: `select_service:${svc.key}:${initiatorId}`,
        })),
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "❌ Exit" },
          value: `exit:${initiatorId}`,
        },
      ],
    },
  ];
}

function buildServiceStatusMenu(service, status, initiatorId) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${service.icon} ${service.label}*\nStatus: *${status.toUpperCase()}*`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "➡️ Lihat Action" },
          value: `open_actions:${service.key}:${initiatorId}`,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "🔙 Kembali" },
          value: `back:service_list:${initiatorId}`,
        },
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "❌ Exit" },
          value: `exit:${initiatorId}`,
        },
      ],
    },
  ];
}

function buildServiceActionsMenu(service, status, initiatorId) {
  const actions = [];

  if (status === "running") {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "⏹ Stop Service" },
      value: `action_exec:stop:${service.key}:${initiatorId}`,
    });
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "🔄 Restart Service" },
      value: `action_exec:restart:${service.key}:${initiatorId}`,
    });
  } else {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "▶️ Start Service" },
      value: `action_exec:start:${service.key}:${initiatorId}`,
    });
  }

  actions.push({
    type: "button",
    text: { type: "plain_text", text: "🔙 Kembali" },
    value: `back:service_status:${service.key}:${initiatorId}`,
  });
  actions.push({
    type: "button",
    style: "danger",
    text: { type: "plain_text", text: "❌ Exit" },
    value: `exit:${initiatorId}`,
  });

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Action untuk ${service.icon} ${service.label}*`,
      },
    },
    { type: "actions", elements: actions },
  ];
}

module.exports = {
  buildConfirmBlocks,
  parseActionValue,
  buildServiceMenu,
  buildServiceStatusMenu,
  buildServiceActionsMenu,
};
