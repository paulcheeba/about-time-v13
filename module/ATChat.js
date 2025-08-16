// module/ATChat.js
// v13.0.5.3 — /at chat command (GM-only output for admin actions)
// Adds: /at now, /at advance <duration>

const MODULE_ID = "about-time-v13";
const AT = () => (game.abouttime ?? game.Gametime);

function gmRecipients() {
  return ChatMessage.getWhisperRecipients("GM").filter(u => u.active).map(u => u.id);
}
function gmWhisper(html) {
  return ChatMessage.create({ content: html, whisper: gmRecipients(), type: CONST.CHAT_MESSAGE_TYPES.OTHER });
}

function parseDuration(input) {
  if (!input) return 0;
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const re = /(\d+)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)/gi;
  let total = 0, m;
  while ((m = re.exec(s))) {
    const val = Number(m[1]); const unit = m[2].toLowerCase();
    if (["d","day","days"].includes(unit)) total += val * 86400;
    else if (["h","hr","hrs","hour","hours"].includes(unit)) total += val * 3600;
    else if (["m","min","mins","minute","minutes"].includes(unit)) total += val * 60;
    else total += val;
  }
  return total;
}

function formatDHMS(total) {
  total = Math.max(0, Math.floor(Number(total) || 0));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${String(d).padStart(2, "0")}:${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatNow() {
  const t = game.time.worldTime;
  if (globalThis.SimpleCalendar?.api) {
    const dt = SimpleCalendar.api.timestampToDate(t);
    const f = SimpleCalendar.api.formatDateTime(dt);
    return `${f.date} ${f.time}`;
  }
  return `t+${t} (${formatDHMS(t)})`;
}

function usage() {
  return gmWhisper(`
    <p><b>/at</b> commands:</p>
    <ul>
      <li><code>/at queue</code> or <code>/at list</code> — show the queue</li>
      <li><code>/at clear</code> — clear the queue</li>
      <li><code>/at stop &lt;uid&gt;</code> — stop a specific event by UID</li>
      <li><code>/at in &lt;duration&gt; &lt;message&gt;</code> — schedule one-time reminder</li>
      <li><code>/at every &lt;duration&gt; &lt;message&gt;</code> — schedule repeating reminder</li>
      <li><code>/at now</code> — show current world time</li>
      <li><code>/at advance &lt;duration&gt;</code> — <i>GM only:</i> advance world time</li>
      <li><small>Duration supports mixed units: <code>1h30m</code>, <code>2d 4h</code>, <code>45m10s</code>, or seconds</small></li>
    </ul>
  `);
}

Hooks.on("chatMessage", (chatLog, message) => {
  const raw = (message ?? "").trim();
  if (!raw.startsWith("/at")) return;

  const api = AT();
  if (!api) {
    ui.notifications?.warn?.("About Time API not found.");
    return false;
  }

  const parts = raw.split(/\s+/);
  const sub = (parts[1] ?? "").toLowerCase();
  if (!sub) { usage(); return false; }

  const reply = (html) => gmWhisper(`<p>[${MODULE_ID}] ${html}</p>`);

  try {
    switch (sub) {
      case "queue":
      case "list": {
        api.chatQueue?.({ showArgs: true, showUid: true, showDate: true, gmOnly: true });
        break;
      }

      case "clear": {
        api.flushQueue?.();
        reply("Queue cleared.");
        break;
      }

      case "stop": {
        const uid = parts[2];
        if (!uid) { reply("Usage: <code>/at stop &lt;uid&gt;</code>"); break; }
        const ok = api.gclearTimeout?.(uid) ?? api.clearTimeout?.(uid);
        reply(`Stop by UID <code>${foundry.utils.escapeHTML(uid)}</code> ${ok ? "succeeded" : "failed"}.`);
        break;
      }

      case "in":
      case "every": {
        const durStr = parts[2];
        if (!durStr) { reply(`Usage: <code>/at ${sub} &lt;duration&gt; &lt;message&gt;</code>`); break; }

        const seconds = parseDuration(durStr);
        if (!seconds || seconds <= 0) { reply("Invalid duration."); break; }

        const msg = parts.slice(3).join(" ").trim() || "(no message)";
        let uid;
        if (sub === "every") {
          uid = api.reminderEvery?.({ seconds }, msg);
          reply(`Repeating every ${formatDHMS(seconds)}: ${foundry.utils.escapeHTML(msg)}`);
        } else {
          uid = api.reminderIn?.({ seconds }, msg);
          reply(`In ${formatDHMS(seconds)}: ${foundry.utils.escapeHTML(msg)}`);
        }
        if (uid) reply(`Event UID: <code>${uid}</code>`);
        break;
      }

      case "now": {
        reply(`Current time: <b>${formatNow()}</b>`);
        break;
      }

      case "advance": {
        if (!game.user.isGM) { reply("Only the GM can advance time."); break; }
        const durStr = parts[2];
        if (!durStr) { reply("Usage: <code>/at advance &lt;duration&gt;</code>"); break; }
        const seconds = parseDuration(durStr);
        if (!seconds || seconds <= 0) { reply("Invalid duration."); break; }
        game.time.advance(seconds).then((newTime) => {
          reply(`Advanced by ${formatDHMS(seconds)} → Now <b>${formatNow()}</b>`);
        }).catch(err => {
          console.error(`${MODULE_ID} | advance failed`, err);
          reply("Advance failed. See console for details.");
        });
        break;
      }

      default:
        usage();
    }
  } catch (err) {
    console.error(`${MODULE_ID} | /at command failed`, err);
    reply("Command failed. See console for details.");
  }

  return false; // prevent the literal chat line from posting
});
