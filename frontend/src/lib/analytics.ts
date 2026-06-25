declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    mixpanel?: { track: (event: string, props?: Record<string, unknown>) => void; identify: (id: string) => void };
  }
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;

  if (window.gtag) {
    window.gtag('event', event, properties);
  }

  if (window.mixpanel) {
    window.mixpanel.track(event, properties);
  }
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (window.mixpanel) {
    window.mixpanel.identify(userId);
    if (traits) {
      window.mixpanel.track('User Identified', traits);
    }
  }
}
