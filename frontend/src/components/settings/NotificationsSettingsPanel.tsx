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

export function NotificationsSettingsPanel() {
  const [browserNotify, setBrowserNotify] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setBrowserNotify(localStorage.getItem(BROWSER_NOTIFY_PROJECT_READY_KEY) !== '0');
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
        description="Only browser device alerts when a project is ready — no email or daily brief spam."
      />

      <div>
        <SettingsRow>
          <Switch
            checked={browserNotify}
            onChange={(next) => void toggleBrowserNotify(next)}
            label="Browser notification when project is ready"
            description="Uses this device's notification permission — alerts are device-specific and won't follow you to another browser or phone."
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
