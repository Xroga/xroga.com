import type { Notification as XrogaNotification } from '@/lib/api';

export const NOTIFICATION_STACK_KEY = 'xroga_notification_stack_enabled';
export const NOTIFICATION_SOUND_KEY = 'xroga_notification_sound_enabled';
export const NOTIFICATION_SEEN_KEY = 'xroga_notification_seen_v1';
export const NOTIFICATION_PREFERENCES_EVENT = 'xroga-notification-preferences';

export function notificationPreference(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(key) !== '0'; } catch { return true; }
}

export function setNotificationPreference(key: string, enabled: boolean) {
  try { window.localStorage.setItem(key, enabled ? '1' : '0'); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(NOTIFICATION_PREFERENCES_EVENT));
}

export function readSeenNotifications(userId: string): Set<string> {
  try {
    const value = JSON.parse(window.localStorage.getItem(`${NOTIFICATION_SEEN_KEY}:${userId}`) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch { return new Set(); }
}

export function rememberSeenNotifications(userId: string, ids: Set<string>) {
  try { window.localStorage.setItem(`${NOTIFICATION_SEEN_KEY}:${userId}`, JSON.stringify([...ids].slice(-250))); } catch { /* storage unavailable */ }
}

export function notificationTone(n: XrogaNotification): 'success' | 'warning' | 'error' | 'info' {
  if (n.type === 'error') return 'error';
  if (n.type === 'warning') return 'warning';
  if (n.type === 'success') return 'success';
  return 'info';
}

export function notificationStatus(n: XrogaNotification): string {
  const tone = notificationTone(n);
  return tone === 'success' ? 'Done' : tone === 'error' ? 'Error' : tone === 'warning' ? 'Needs attention' : 'Update';
}

let audioContext: AudioContext | null = null;

/** Prepare audio only after an actual user gesture so a later background chime can play. */
export function primeNotificationAudio() {
  if (typeof window === 'undefined' || !notificationPreference(NOTIFICATION_SOUND_KEY)) return;
  try {
    audioContext ??= new window.AudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume();
  } catch { /* audio unavailable */ }
}

/** A restrained two-note chime; browsers may suppress audio without a prior user gesture. */
export function playNotificationChime() {
  if (typeof window === 'undefined' || !notificationPreference(NOTIFICATION_SOUND_KEY)) return;
  try {
    if (!window.AudioContext) return;
    audioContext ??= new window.AudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const now = audioContext.currentTime;
    for (const [offset, frequency] of [[0, 660], [0.11, 880]] as const) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.075, now + offset + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.26);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.27);
    }
  } catch { /* audio unavailable */ }
}
