// Task reminder scheduler (IDE, webview-side).
//
// Scans the local task store on an interval and fires a notification when a
// task's reminder falls due. Runs while the app window is open (the only time
// the desktop app is usable), mirroring the extension's host-side scheduler.
//
// Notifications use the Web Notification API, which is available in the Tauri
// webview and asks the user's OS permission via requestPermission(). We request
// it lazily — only when the first reminder is actually due — so users who never
// set a reminder are never prompted. An `ava-task-reminder` window event is
// always dispatched as an in-app fallback (e.g. if permission is denied). Dedupe
// is via the task's reminderFiredAt.
//
// (A future upgrade to native OS notifications would register
// @tauri-apps/plugin-notification on the Rust side; the Web API needs no native
// wiring and keeps reminders working today.)

import { getDueLocalReminders, markLocalReminderFired } from './task-store';

let started = false;
let permissionAsked = false;
let granted = false;

/** Request notification permission once, lazily. Returns whether granted. */
async function ensurePermission(): Promise<boolean> {
  if (granted) return true;
  try {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') { granted = true; return true; }
    if (Notification.permission !== 'denied' && !permissionAsked) {
      permissionAsked = true;
      granted = (await Notification.requestPermission()) === 'granted';
      return granted;
    }
    return false;
  } catch {
    return false;
  }
}

async function tick(): Promise<void> {
  let due;
  try { due = await getDueLocalReminders(); } catch { return; }
  if (!due.length) return;

  const ok = await ensurePermission();
  for (const t of due) {
    // Stamp first so a slow notification can't double-fire next tick.
    await markLocalReminderFired(t.id).catch(() => {});
    // Always surface an in-app fallback event (covers denied permission).
    try { window.dispatchEvent(new CustomEvent('ava-task-reminder', { detail: { id: t.id, title: t.title } })); } catch { /* ignore */ }
    if (ok) {
      try { new Notification('Ava — task reminder', { body: `⏰ ${t.title}` }); } catch { /* ignore */ }
    }
  }
}

/** Start the scheduler once. Idempotent — safe to call from a mount effect.
 *  Returns a stop function. */
export function startTaskReminderScheduler(): () => void {
  if (started) return () => {};
  started = true;
  const first = setTimeout(() => { tick().catch(() => {}); }, 8000);
  const timer = setInterval(() => { tick().catch(() => {}); }, 30000);
  return () => { clearTimeout(first); clearInterval(timer); started = false; };
}
