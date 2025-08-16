// about-time.js — v13.0.5.4
import { registerSettings, MODULE_ID } from './module/settings.js';
import { preloadTemplates } from './module/preloadTemplates.js';
import { ElapsedTime } from './module/ElapsedTime.js';
import { PseudoClock } from './module/PseudoClock.js';
import { DTMod } from './module/calendar/DTMod.js';
import { DTCalc } from './module/calendar/DTCalc.js';

// Side-effect imports (register hooks/features)
import './module/ATChat.js';       // /at commands
import './module/ATToolbar.js';    // toolbar tool (self-contained)

export function DTNow() { return game.time.worldTime; }

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing`);
  registerSettings();
  preloadTemplates().catch(() => {});
});

let operations;
export const calendars = {};

Hooks.once('setup', () => {
  operations = {
    isMaster: () => PseudoClock.isMaster,
    isRunning: PseudoClock.isRunning,
    doAt: ElapsedTime.doAt,
    doIn: ElapsedTime.doIn,
    doEvery: ElapsedTime.doEvery,
    doAtEvery: ElapsedTime.doAtEvery,
    reminderAt: ElapsedTime.reminderAt,
    reminderIn: ElapsedTime.reminderIn,
    reminderEvery: ElapsedTime.reminderEvery,
    reminderAtEvery: ElapsedTime.reminderAtEvery,
    notifyAt: ElapsedTime.notifyAt,
    notifyIn: ElapsedTime.notifyIn,
    notifyEvery: ElapsedTime.notifyEvery,
    notifyAtEvery: ElapsedTime.notifyAtEvery,
    clearTimeout: ElapsedTime.gclearTimeout,
    getTimeString: ElapsedTime.currentTimeString,
    getTime: ElapsedTime.currentTimeString,
    queue: ElapsedTime.showQueue,
    chatQueue: ElapsedTime.chatQueue,
    ElapsedTime,
    DTM: DTMod,
    DTC: DTCalc,
    DMf: DTMod.create,
    calendars,
    DTNow,
    _notifyEvent: PseudoClock.notifyEvent,
    startRunning: () => globalThis.SimpleCalendar?.api?.startClock?.(),
    stopRunning: () => globalThis.SimpleCalendar?.api?.stopClock?.(),
    mutiny: PseudoClock.mutiny,
    advanceClock: ElapsedTime.advanceClock,
    advanceTime: ElapsedTime.advanceTime,
    setClock: PseudoClock.setClock,
    setTime: ElapsedTime.setTime,
    setAbsolute: ElapsedTime.setAbsolute,
    setDateTime: ElapsedTime.setDateTime,
    flushQueue: ElapsedTime._flushQueue,
    reset: ElapsedTime._initialize,
    resetCombats: () => console.error(`${MODULE_ID} | not supported`),
    status: ElapsedTime.status,
    pc: PseudoClock,
    showClock: () => globalThis.SimpleCalendar?.api?.showCalendar?.(null, true),
    showCalendar: () => globalThis.SimpleCalendar?.api?.showCalendar?.(),
    deleteUuid: async (uuid) => {
      const thing = foundry?.utils?.fromUuidSync?.(uuid) ?? globalThis.fromUuidSync?.(uuid);
      if (thing && typeof thing.delete === 'function') await thing.delete();
    },
    _save: ElapsedTime._save,
    _load: ElapsedTime._load
  };

  // Expose on game + legacy shims
  // @ts-ignore
  game.abouttime = operations;
  const warnProxy = {
    get(target, prop, receiver) {
      console.warn(`${MODULE_ID} | Gametime.${String(prop)} is deprecated. Use game.abouttime.${String(prop)}.`);
      return Reflect.get(target, prop, receiver);
    }
  };
  // @ts-ignore
  game.Gametime = new Proxy(operations, warnProxy);
  // @ts-ignore
  globalThis.abouttime = operations;
  // @ts-ignore
  globalThis.Gametime = new Proxy(operations, warnProxy);
});

Hooks.once('ready', () => {
  if (!game.modules.get("foundryvtt-simple-calendar")?.active) {
    console.warn(`${MODULE_ID} | Simple Calendar not active (optional).`);
  }
  PseudoClock.init();
  ElapsedTime.init();
});
