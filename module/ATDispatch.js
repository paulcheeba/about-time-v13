// v13.0.9.0.5 — Add dispatcher-based GM whisper; persist descriptors only; no functional changes elsewhere.
export async function dispatch(desc) {
  try {
    if (!desc || desc.kind !== "chat") return;
    return chatDispatch(desc.action, desc.data ?? {});
  } catch (e) {
    console.warn("about-time | dispatch error", e);
  }
}

async function chatDispatch(action, data) {
  const ids = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
  const safe = (txt) => (globalThis.foundry?.utils?.escapeHTML?.(String(txt)) ?? String(txt));
  const html = (inner) => `<p>${inner}</p>`;
  const msg = data?.msg ?? data?.text ?? data?.name ?? "(event)";

  switch (action) {
    case "gm/notify-error":
      return ChatMessage.create({ content: html("Error: " + safe(msg)), whisper: ids });
    case "gm/event-created":
      return ChatMessage.create({ content: html(safe(msg)), whisper: ids });
    case "gm/event-fired":
      return ChatMessage.create({ content: html(safe(msg)), whisper: ids });
    case "gm/notify-basic":
    default:
      return ChatMessage.create({ content: html(safe(msg)), whisper: ids });
  }
}
