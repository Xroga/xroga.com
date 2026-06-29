'use client';

import { useEffect, useRef } from 'react';
import { API_URL } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

export function XTermPane() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    let disposed = false;

    async function init() {
      if (!containerRef.current || disposed) return;

      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');

      const term = new Terminal({
        theme: { background: '#0d0d0d', foreground: '#e0e0e0', cursor: '#006aff' },
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        cursorBlink: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();

      term.writeln('XROGA Automation Runtime — type commands (help for list)');
      term.write('\r\n$ ');

      let buffer = '';
      term.onData(async (data) => {
        if (data === '\r') {
          const cmd = buffer.trim();
          buffer = '';
          term.write('\r\n');
          if (cmd) await runCommand(cmd, term);
          term.write('$ ');
          return;
        }
        if (data === '\u007F') {
          if (buffer.length) {
            buffer = buffer.slice(0, -1);
            term.write('\b \b');
          }
          return;
        }
        buffer += data;
        term.write(data);
      });

      termRef.current = term;

      const onResize = () => fit.fit();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    void init();
    return () => {
      disposed = true;
      termRef.current?.dispose();
    };
  }, []);

  return <div ref={containerRef} className="h-48 p-1" />;
}

async function runCommand(
  cmd: string,
  term: { writeln: (s: string) => void }
) {
  if (cmd === 'help') {
    term.writeln('  help — this message');
    term.writeln('  clear — clear screen');
    term.writeln('  deploy — trigger deploy pipeline');
    term.writeln('  status — check swarm status');
    return;
  }
  if (cmd === 'clear') {
    term.writeln('');
    return;
  }

  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${API_URL}/api/v1/terminal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ command: cmd }),
    });
    const data = (await res.json()) as { output?: string };
    term.writeln(data.output ?? 'Command processed.');
  } catch {
    term.writeln('XROGA is processing — try again in a moment.');
  }
}
