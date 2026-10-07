'use client';

import { useEffect, useRef, useState } from 'react';

export function HomepageBrowserEmployeesExact() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(640);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload || payload.source !== 'xroga-browser-employees-exact') return;
      const nextHeight = Number(payload.height);
      if (!Number.isFinite(nextHeight)) return;
      setFrameHeight(Math.max(420, Math.min(2600, Math.ceil(nextHeight))));
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <section
      aria-label="Xroga browser employees"
      style={{ width: '100%', overflow: 'hidden', background: '#050607' }}
    >
      <iframe
        ref={frameRef}
        src="/demos/xroga-browser-employees-exact.html"
        title="Xroga browser employees"
        sandbox="allow-scripts"
        scrolling="no"
        style={{
          display: 'block',
          width: '100%',
          height: frameHeight,
          border: 0,
          background: '#050607',
        }}
      />
    </section>
  );
}
