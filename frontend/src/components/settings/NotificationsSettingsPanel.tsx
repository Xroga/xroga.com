'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { SettingsPanelHeader, SettingsRow, SettingsStack } from '@/components/settings/SettingsPrimitives';
import {
  BROWSER_NOTIFY_PROJECT_READY_KEY,
  requestBuildNotificationPermission,
  showBuildBrowserNotification,
} from '@/lib/buildBrowserNotify';
import { NOTIFICATION_SOUND_KEY, NOTIFICATION_STACK_KEY, notificationPreference, setNotificationPreference } from '@/lib/notificationExperience';

export function NotificationsSettingsPanel() {
  const [browserNotify, setBrowserNotify] = useState(false);
  const [stackNotify, setStackNotify] = useState(false);
  const [soundNotify, setSoundNotify] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setBrowserNotify(typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem(BROWSER_NOTIFY_PROJECT_READY_KEY) !== '0');
    setStackNotify(notificationPreference(NOTIFICATION_STACK_KEY));
    setSoundNotify(notificationPreference(NOTIFICATION_SOUND_KEY));
    setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  }, []);

  async function toggleBrowserNotify(next: boolean) {
    if (next) {
      const ok = await requestBuildNotificationPermission();
      setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
      if (!ok) {
        toast.error('Browser blocked notifications — allow them in site settings');
        setBrowserNotify(false);
        localStorage.setItem(BROWSER_NOTIFY_PROJECT_READY_KEY, '0');
        return;
      }
      localStorage.setItem(BROWSER_NOTIFY_PROJECT_READY_KEY, '1');
      setBrowserNotify(true);
      showBuildBrowserNotification({
        title: 'Xroga notifications on',
        body: 'We’ll alert you in this browser when a project is ready.',
        tag: 'xroga-notify-test',
      });
      toast.success('Browser notifications enabled');
      return;
    }
    localStorage.setItem(BROWSER_NOTIFY_PROJECT_READY_KEY, '0');
    setBrowserNotify(false);
    toast.success('Browser notifications off');
  }

  return (
    <SettingsStack>
      <SettingsPanelHeader
        icon={<Bell className="h-4 w-4" aria-hidden="true" />}
        title="Notifications"
        description="Choose how Xroga tells you about real task completions, failures, and updates."
      />

      <div>
        <SettingsRow>
          <Switch checked={stackNotify} onChange={(next) => { setNotificationPreference(NOTIFICATION_STACK_KEY, next); setStackNotify(next); }} label="In-app notification stack" description="Show recent updates in the bottom-right corner. Hover or focus to see up to six; the sidebar bell always remains available." />
        </SettingsRow>
        <SettingsRow>
          <Switch checked={soundNotify} onChange={(next) => { setNotificationPreference(NOTIFICATION_SOUND_KEY, next); setSoundNotify(next); }} label="Completion sound" description="Play a short chime when new updates arrive while this tab is in the background. Browser audio rules may require a previous interaction." />
        </SettingsRow>
        <SettingsRow>
          <Switch
            checked={browserNotify}
            onChange={(next) => void toggleBrowserNotify(next)}
            label="Browser notifications"
            description="Show real task updates outside the page while this tab remains open in the background. Requires this device's notification permission."
          />
        </SettingsRow>
        {permission === 'denied' && (
          <p className="mt-2 text-xs text-[var(--danger)]">
            Notifications are blocked at the browser level. Allow them in your browser&rsquo;s site settings, then toggle this back on.
          </p>
        )}
        {permission === 'unsupported' && (
          <Badge tone="neutral" className="mt-2">
            Not supported in this browser
          </Badge>
        )}
      </div>
    </SettingsStack>
  );
}
