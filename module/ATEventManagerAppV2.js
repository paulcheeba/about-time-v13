// v13.0.8.0.2 — EM V2 fixes: pass element to row actions (Stop/Copy UID)

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { ElapsedTime } from "./ElapsedTime.js";
import { MODULE_ID } from "./settings.js";

export class ATEventManagerAppV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "at-em-v2",
    classes: ["about-time", "at-emv2", "at-dracula"],
    tag: "form",
    window: { title: "About Time — Event Manager V2", icon: "fas fa-clock", resizable: true },
    position: { width: 920, height: "auto" },
    actions: {
      create(ev, el)      { return this.onCreate(ev); },
      list(ev, el)        { return this.onList(ev); },
      flush(ev, el)       { return this.onFlush(ev); },
      "flush-rem"(ev, el) { return this.onFlushRem(ev); },
      "stop-by-name"(ev)  { return this.onStopByName(ev); },
      "stop-by-uid"(ev)   { return this.onStopByUID(ev); },
      // pass clicked element so we can read data-uid reliably
      "row-stop"(ev, el)  { return this.onRowStop(ev, el); },
      "copy-uid"(ev, el)  { return this.onCopyUID(ev, el); }
    }
  };

  static PARTS = { body: { template: "modules/about-time-v13/templates/ATEventManagerAppV2.hbs" } };

  #ticker = null;

  async render(force, options = {}) {
    const out = await super.render(force, options);
    this.element?.style && (this.element.style.minWidth = "920px");
    if (!this.#ticker) this.#startTicker();
    return out;
  }

  async close(options) { this.#stopTicker(); return super.close(options); }

  async _prepareContext() {
    const now = game.time.worldTime;
    const q = ElapsedTime?._eventQueue;
    const entries = [];
    if (q?.array && Number.isInteger(q.size)) {
      for (let i = 0; i < q.size; i++) {
        const e = q.array[i]; if (!e) continue;
        const meta = e?._args?.[0] ?? {};
        const name = String(meta.__atName ?? "");
        const msg  = String(meta.__atMsg  ?? "");
        const inc  = Number(e?._increment || 0);
        const time = Number(e._time || 0);
        entries.push({
          uid: e._uid,
          name, msg, time,
          startTxt: this.#fmtTimestamp(time),
          remainingTxt: this.#fmtDHMS(Math.max(0, Math.floor(time - now))),
          recurring: !!e?._recurring,
          incTxt: inc ? this.#fmtDHMS(inc) : ""
        });
      }
    }
    return { isGM: !!game.user?.isGM, entries };
  }

  // ---- Actions ----
  async onCreate(event) {
    if (!game.user?.isGM) return ui.notifications?.warn?.("GM only");
    const fd = new FormData(this.form);
    const name      = String(fd.get("eventName") || "").trim();
    const durStr    = String(fd.get("duration")  || "").trim();
    const message   = String(fd.get("message")   || "");
    const repeat    = fd.get("repeat")    === "on";
    const runMacro  = fd.get("runMacro")  === "on";
    const macroName = String(fd.get("macroName") || "").trim();

    const seconds = this.#parseMixedDuration(durStr);
    if (!seconds || seconds <= 0) return this.#gmWhisper(`<p>[${MODULE_ID}] Enter a valid duration.</p>`);

    const meta = { __atName: name || (runMacro ? macroName : "(unnamed)"), __atMsg: message };

    const handler = async (metaArg) => {
      try {
        if (runMacro && macroName) {
          const macro = game.macros.getName?.(macroName) ?? game.macros.find?.(m => m.name === macroName);
          if (macro) {
            if (isNewerVersion(game.version, "11.0")) await macro.execute({ args: [metaArg] });
            else {
              const body = `return (async () => { ${macro.command} })()`;
              const fn = Function("{speaker, actor, token, character, item, args}={}", body);
              await fn.call(this, { speaker: {}, args: [metaArg] });
            }
          } else ui.notifications?.warn?.(`[${MODULE_ID}] Macro not found: ${macroName}`);
        } else {
          await this.#gmWhisper(`<p>[${MODULE_ID}] ${foundry.utils.escapeHTML(metaArg.__atMsg || metaArg.__atName || "(event)")}</p>`);
        }
      } catch (err) {
        console.error(`${MODULE_ID} | handler failed`, err);
        await this.#gmWhisper(`<p>[${MODULE_ID}] Handler error: ${foundry.utils.escapeHTML(err?.message || err)}</p>`);
      }
    };

    const AT = game.abouttime ?? game.Gametime;
    const uid = repeat ? AT.doEvery({ seconds }, handler, meta) : AT.doIn({ seconds }, handler, meta);
    if (name) await game.user.setFlag(MODULE_ID, name, uid);

    await this.#gmWhisper(
      `<p>[${MODULE_ID}] Created <strong>${repeat ? "repeating" : "one-time"}</strong> event:
        <code>${foundry.utils.escapeHTML(uid)}</code> — ${this.#fmtDHMS(seconds)} — “${foundry.utils.escapeHTML(meta.__atName)}”</p>`
    );
    this.render(true);
  }

  async onStopByName(event) {
    if (!game.user?.isGM) return;
    const fd = new FormData(this.form);
    const key = String(fd.get("stopKey") || "").trim();
    if (!key) return this.#gmWhisper(`<p>[${MODULE_ID}] Enter an Event Name to stop.</p>`);

    const AT = game.abouttime ?? game.Gametime;
    const q = ElapsedTime?._eventQueue;
    let count = 0;
    if (q?.array && Number.isInteger(q.size)) {
      const target = key.toLowerCase();
      for (let i = 0; i < q.size; i++) {
        const e = q.array[i];
        if ((e?._args?.[0]?.__atName || "").toLowerCase() === target) {
          if (AT.clearTimeout(e._uid)) count++;
        }
      }
    }

    if (count) {
      const flags = (await game.user.getFlag(MODULE_ID)) || {};
      for (const k of Object.keys(flags)) {
        let exists = false;
        if (q?.array && Number.isInteger(q.size)) {
          for (let i = 0; i < q.size; i++) if (q.array[i]?._uid === flags[k]) { exists = true; break; }
        }
        if (!exists) await game.user.unsetFlag(MODULE_ID, k);
      }
      await this.#gmWhisper(`<p>[${MODULE_ID}] Stopped ${count} event(s) named <strong>${foundry.utils.escapeHTML(key)}</strong>.</p>`);
    } else {
      await this.#gmWhisper(`<p>[${MODULE_ID}] No events found named <strong>${foundry.utils.escapeHTML(key)}</strong>.</p>`);
    }
    this.render();
  }

  async onStopByUID(event) {
    if (!game.user?.isGM) return;
    const fd = new FormData(this.form);
    const uid = String(fd.get("stopKey") || "").trim();
    if (!uid) return this.#gmWhisper(`<p>[${MODULE_ID}] Enter a UID to stop.</p>`);
    const ok = (game.abouttime ?? game.Gametime).clearTimeout(uid);
    if (ok) await this.#gmWhisper(`<p>[${MODULE_ID}] Stopped event <code>${foundry.utils.escapeHTML(uid)}</code>.</p>`);
    else    await this.#gmWhisper(`<p>[${MODULE_ID}] No event found for UID <code>${foundry.utils.escapeHTML(uid)}</code>.</p>`);
    this.render();
  }

  async onList() {
    (game.abouttime ?? game.Gametime).chatQueue({ showArgs: false, showUid: true, showDate: true, gmOnly: true });
    await this.#gmWhisper(`<p>[${MODULE_ID}] Queue listed to GM chat.</p>`);
  }

  async onFlush() {
    const AT = game.abouttime ?? game.Gametime;
    const q = ElapsedTime?._eventQueue; const count = q?.size ?? 0;
    AT.flushQueue?.();
    await this.#gmWhisper(`<p>[${MODULE_ID}] Flushed ${count} event(s).</p>`);
    this.render();
  }

  async onFlushRem() {
    const AT = game.abouttime ?? game.Gametime;
    const q = ElapsedTime?._eventQueue; const count = q?.size ?? 0;
    AT.flushQueue?.();
    AT.reminderIn?.({ seconds: 3600 }, `[${MODULE_ID}] Queue was flushed an hour ago.`);
    await this.#gmWhisper(`<p>[${MODULE_ID}] Flushed ${count} event(s) and scheduled 1h reminder.</p>`);
    this.render();
  }

  async onRowStop(event, el) {
    if (!game.user?.isGM) return;
    const uid = el?.dataset?.uid || event?.currentTarget?.dataset?.uid;
    if (!uid) return;
    const ok = (game.abouttime ?? game.Gametime).clearTimeout(uid);
    if (ok) await this.#gmWhisper(`<p>[${MODULE_ID}] Stopped event <code>${foundry.utils.escapeHTML(uid)}</code>.</p>`);
    this.render();
  }

  async onCopyUID(event, el) {
    const uid = el?.dataset?.uid || event?.currentTarget?.dataset?.uid;
    if (!uid) return;
    try {
      await navigator.clipboard?.writeText?.(uid);
      ui.notifications?.info?.("UID copied to clipboard");
    } catch {
      // fallback for older browsers/permissions
      const ta = document.createElement("textarea");
      ta.value = uid; document.body.appendChild(ta);
      ta.select(); document.execCommand?.("copy"); document.body.removeChild(ta);
      ui.notifications?.info?.("UID copied (fallback)");
    }
  }

  #gmWhisper(html) {
    const ids = ChatMessage.getWhisperRecipients("GM").filter((u) => u.active).map((u) => u.id);
    return ChatMessage.create({ content: html, whisper: ids });
  }

  #parseMixedDuration(input) {
    if (!input || typeof input !== "string") return 0;
    let total = 0; const re = /(\d+)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)?/gi;
    let m; while ((m = re.exec(input))) {
      const v = Number(m[1]); const u = (m[2] || "s").toLowerCase();
      total += ["d","day","days"].includes(u) ? v*86400
             : ["h","hr","hrs","hour","hours"].includes(u) ? v*3600
             : ["m","min","mins","minute","minutes"].includes(u) ? v*60
             : v;
    }
    return Math.floor(total);
  }

  #fmtDHMS(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${String(d).padStart(2, "0")}:${pad(h)}:${pad(m)}:${pad(sec)}`;
  }

  #fmtTimestamp(ts) {
    const api = globalThis.SimpleCalendar?.api;
    if (api?.timestampToDate && api?.formatDateTime) {
      const dt = api.timestampToDate(ts);
      const f = api.formatDateTime(dt) ?? { date: "", time: `t+${ts}` };
      return `${f.date ? f.date + " " : ""}${f.time}`;
    }
    return `t+${ts}`;
  }

  #startTicker() {
    this.#stopTicker();
    this.#ticker = setInterval(() => {
      const now = game.time.worldTime;
      for (const el of this.element?.querySelectorAll?.("[data-remaining][data-time]") ?? []) {
        const time = Number(el.dataset.time || 0);
        el.textContent = this.#fmtDHMS(Math.max(0, Math.floor(time - now)));
      }
    }, 1000);
  }

  #stopTicker() { if (this.#ticker) { clearInterval(this.#ticker); this.#ticker = null; } }
}

export function openATEventManagerV2(options = {}) { return new ATEventManagerAppV2(options).render(true); }
