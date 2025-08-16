// module/ATToolbar.js — v13.0.5.4 (fix: replace DialogV2 d.wait(...) with d.render(true))
const MODULE_ID = "about-time-v13";
const FA_ICON = "fa-regular fa-clock"; // small clock icon

const AT = () => (game.abouttime ?? game.Gametime);

function esc(s) { return foundry.utils.escapeHTML(String(s ?? "")); }
function gmIds() { return ChatMessage.getWhisperRecipients("GM").filter(u => u.active).map(u => u.id); }
function gmWhisper(html) { return ChatMessage.create({ content: html, whisper: gmIds(), type: CONST.CHAT_MESSAGE_TYPES.OTHER }); }

function formatDHMS(total) {
  total = Math.max(0, Math.floor(Number(total) || 0));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${String(d).padStart(2, "0")}:${pad(h)}:${pad(m)}:${pad(s)}`;
}
function fmtTime(ts) {
  if (globalThis.SimpleCalendar?.api) {
    const dt = SimpleCalendar.api.timestampToDate(ts);
    const f = SimpleCalendar.api.formatDateTime(dt);
    return `${f.date} ${f.time}`;
  }
  const d = new Date(ts * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildStatusText() {
  const api = AT();
  const q = api?.ElapsedTime?._eventQueue;
  if (!q || !Array.isArray(q.array) || q.size === 0) {
    return `<textarea class="status-ta" readonly="" style="height: 200px; width: 100%;">- (empty queue) -</textarea>`;
  }
  const lines = [];
  for (let i = 0; i < q.size; i++) {
    const e = q.array[i];
    const name = typeof e._handler === "string" ? e._handler : "[function]";
    const start = fmtTime(e._time);
    let duration = "";
    if (e._recurring) {
      let sec = 0;
      if (globalThis.SimpleCalendar?.api && e._increment) {
        sec = SimpleCalendar.api.timestampPlusInterval(0, e._increment) ?? 0;
      } else if (e._increment) {
        const inc = e._increment;
        sec = (inc.second ?? inc.seconds ?? 0) + (inc.minute ?? 0)*60 + (inc.hour ?? 0)*3600 + (inc.day ?? 0)*86400;
      }
      duration = formatDHMS(sec);
    } else {
      duration = formatDHMS(Math.max(0, e._time - game.time.worldTime));
    }
    const msg = Array.isArray(e._args) && e._args.length ? String(e._args.join(" ")) : "";
    lines.push(`${name}, ${start}, ${duration}, ${msg}`);
  }
  return `<textarea class="status-ta" readonly="" style="height: 200px; width: 100%;">${esc(lines.join("\n"))}</textarea>`;
}

function openEventManager() {
  const content = `
    <style>
      .at-wrap { color:#f8f8f2; }
      .at-wrap .window-content { background:#1e1f29 !important; }
      .at-note { color:#9aa0b4; margin:.25rem 0 .75rem; }
      .at-box { border:1px solid #3c4054; border-radius:6px; background:#232530; padding:.6rem .7rem; }
      .at-hdr { font-weight:700; margin-bottom:.5rem; color:#f8f8f2; }
      .at-label { color:#f8f8f2; font-weight:600; margin-top:.6rem; margin-bottom:.25rem; display:block; }
      .at-input { width:100%; background:#2a2c37; color:#f8f8f2; border:1px solid #3c4054; border-radius:6px; padding:.5rem .65rem; }
      .at-btns { display:flex; flex-wrap:wrap; gap:.6rem; margin-top:.9rem; }
      .at-btn { background:#2a2c37; color:#f8f8f2; border:1px solid #3c4054; border-radius:8px; padding:.6rem 1rem; }
      .at-btn.warn { background:#ffb86c; border-color:#ffb86c; color:#1b1b1f; }
      .at-btn.danger { background:#ff5555; border-color:#ff5555; }
      textarea.status-ta { font-family: var(--font-primary); resize: none; }
    </style>
    <div class="at-wrap">
      <div class="at-box">
        <div class="at-hdr">Event Status Board</div>
        ${buildStatusText()}
      </div>
      <div class="at-btns">
        <button type="button" class="at-btn" data-at="queue">Send Queue to Chat</button>
        <button type="button" class="at-btn warn" data-at="stop-all">Stop all Events</button>
        <button type="button" class="at-btn danger" data-at="close">Close</button>
      </div>
    </div>
  `;

  const useV2 = !!foundry?.applications?.api?.DialogV2;
  if (useV2) {
    const d = new foundry.applications.api.DialogV2({
      content,
      buttons: [
        { action: "queue", label: "Queue",  icon: "fa-solid fa-list" },
        { action: "stop",  label: "Stop All", class:"warn", icon: "fa-solid fa-ban" },
        { action: "close", label: "Close",  class:"danger", icon: "fa-solid fa-xmark", default: true }
      ],
      submit: async (action, dialog) => {
        const api = AT();
        if (action === "queue") {
          api.chatQueue?.({ showArgs: true, showUid: true, showDate: true, gmOnly: true });
          gmWhisper(`[${MODULE_ID}] Queue sent to chat.`);
          dialog.render(true); // refresh instead of close
        } else if (action === "stop") {
          api.flushQueue?.();
          gmWhisper(`[${MODULE_ID}] All events purged.`);
          dialog.render(true); // refresh instead of close
        } else {
          dialog.close();
        }
      }
    });
    // FIX: DialogV2 has no instance wait() in v13 — render directly
    d.render(true);
  } else {
    const dlg = new Dialog({
      title: "About Time — Event Manager",
      content,
      buttons: {
        queue: {
          label: "Queue",
          icon: '<i class="fa-solid fa-list"></i>',
          callback: () => {
            const api = AT();
            api.chatQueue?.({ showArgs: true, showUid: true, showDate: true, gmOnly: true });
            gmWhisper(`[${MODULE_ID}] Queue sent to chat.`);
            dlg.data.content = content; dlg.render(true);
          }
        },
        stop: {
          label: "Stop All",
          icon: '<i class="fa-solid fa-ban"></i>',
          callback: () => {
            const api = AT();
            api.flushQueue?.();
            gmWhisper(`[${MODULE_ID}] All events purged.`);
            dlg.data.content = content; dlg.render(true);
          }
        },
        close: {
          label: "Close",
          icon: '<i class="fa-solid fa-xmark"></i>'
        }
      },
      default: "close"
    });
    dlg.render(true);
  }
}

// v13: controls is a Record<string, SceneControl>
Hooks.on("getSceneControlButtons", (controls) => {
  try {
    const key = "notes" in controls ? "notes" : ("journal" in controls ? "journal" : null);
    if (!key) return;

    const set = controls[key];
    if (!set || typeof set !== "object") return;

    // Ensure tools object exists
    set.tools ??= {};

    // Add our tool under the chosen control set
    set.tools["about-time-event-manager"] = {
      name: "about-time-event-manager",
      title: "About Time — Event Manager",
      icon: FA_ICON,
      button: true,
      visible: game.user.isGM,
      onChange: (_ev, active) => { if (active) openEventManager(); },
      order: 99
    };
  } catch (err) {
    console.error(`${MODULE_ID} | getSceneControlButtons failed`, err);
  }
});
