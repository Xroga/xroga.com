import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { CloseIcon } from '@src/ui/icons';
import { WORKSPACE_ORIGIN } from '@src/xroga/workspace';

type Plugin = { slug: string; name?: string; logo?: string; description?: string; toolsCount?: number; canConnect?: boolean;
  deprecated?: boolean; noAuth?: boolean; categories?: Array<{ name: string }> };
// The logo comes only from the backend allowlist; a missing or failing image falls back to the first letter.
function PluginIcon({ plugin, size = 28 }: { plugin: { slug: string; name?: string; logo?: string }; size?: number }) {
  const [failed, setFailed] = useState(false);
  const letter = (plugin.name ?? plugin.slug).trim().charAt(0).toUpperCase() || '?';
  const box = { width: size, height: size } as const;
  return plugin.logo && !failed ? (
    <img src={plugin.logo} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer"
      onError={() => setFailed(true)} className="shrink-0 rounded-md bg-white object-contain p-0.5" style={box} />
  ) : (
    <span aria-hidden="true" style={box} className="flex shrink-0 items-center justify-center rounded-md bg-nb-surface text-xs font-semibold">{letter}</span>
  );
}

type Tool = { slug: string; name?: string; risk?: string; scopes?: string[] };
type Reply = { error?: string; items?: Plugin[]; nextCursor?: string; tools?: Tool[]; redirectUrl?: string };

async function request(op: string, data: Record<string, string> = {}): Promise<Reply> {
  const value = await chrome.runtime.sendMessage({ type: 'xroga.browser.plugins.v1', op, ...data }) as Reply | undefined;
  if (!value || value.error) throw new Error(value?.error || 'The Xroga extension is reconnecting. Try again.');
  return value;
}

export function Plugins({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'discover' | 'connected'>('discover');
  const [items, setItems] = useState<Plugin[]>([]);
  const [connected, setConnected] = useState<Plugin[]>([]);
  const [selected, setSelected] = useState<Plugin>();
  const [details, setDetails] = useState<Tool[]>();
  const [cursor, setCursor] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectionsChecked, setConnectionsChecked] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [detailsError, setDetailsError] = useState('');
  const [linkState, setLinkState] = useState<'opening' | 'pending'>();
  const [version, setVersion] = useState(0);
  const generation = useRef(0);
  const linkBusy = useRef(false);

  useEffect(() => {
    if (!open) return;
    setConnectionsChecked(false);
    setConnectionError('');
    let current = true;
    const refresh = () => void request('connected').then(
      data => {
        if (!current) return;
        setConnected((data.items ?? []).filter(item => !item.noAuth));
        setConnectionsChecked(true);
        setConnectionError('');
      },
      (failure: Error) => {
        if (!current) return;
        setConnected([]);
        setConnectionsChecked(false);
        setConnectionError(failure.message);
      },
    );
    refresh();
    window.addEventListener('focus', refresh);
    return () => { current = false; window.removeEventListener('focus', refresh); };
  }, [open, version]);

  useEffect(() => {
    if (!open) return;
    const current = ++generation.current;
    setLoading(true);
    setItems([]);
    setCursor('');
    setError('');
    const timer = window.setTimeout(() => void request('catalog', { search: query }).then(
      data => {
        if (current !== generation.current) return;
        setItems(data.items ?? []);
        setCursor(data.nextCursor ?? '');
        setLoading(false);
      },
      (failure: Error) => {
        if (current !== generation.current) return;
        setError(failure.message);
        setLoading(false);
      },
    ), query ? 220 : 0);
    const invalidate = () => { generation.current++; };
    return () => { window.clearTimeout(timer); invalidate(); };
  }, [open, query, version]);

  useEffect(() => {
    if (!open || !selected) return;
    let current = true;
    setDetails(undefined);
    setDetailsError('');
    setLinkState(undefined);
    void request('details', { toolkit: selected.slug }).then(
      data => { if (current) setDetails(data.tools ?? []); },
      (failure: Error) => { if (current) setDetailsError(failure.message); },
    );
    return () => { current = false; };
  }, [open, selected]);

  async function loadMore() {
    const current = generation.current;
    setLoading(true);
    try {
      const data = await request('catalog', { search: query, cursor });
      if (current !== generation.current) return;
      setItems(previous => [...new Map([...previous, ...(data.items ?? [])].map(item => [item.slug, item])).values()]);
      setCursor(data.nextCursor ?? '');
    } catch (failure) {
      if (current === generation.current) setError((failure as Error).message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }

  async function connect(plugin: Plugin) {
    if (linkBusy.current || linkState) return;
    linkBusy.current = true;
    setLinkState('opening');
    setDetailsError('');
    try {
      const data = await request('link', { toolkit: plugin.slug });
      const url = new URL(data.redirectUrl ?? '');
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
          url.hostname !== 'connect.composio.dev') throw new Error('Invalid authorization link.');
      await chrome.tabs.create({ url: url.href });
      setLinkState('pending');
    } catch (failure) {
      setDetailsError((failure as Error).message);
      setLinkState(undefined);
    } finally {
      linkBusy.current = false;
    }
  }

  const filtered = tab === 'discover' ? items : connected.filter(item =>
    (item.name ?? item.slug).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const isConnected = (item: Plugin) => connectionsChecked && connected.some(plugin => plugin.slug === item.slug);
  const button = 'rounded-lg border border-nb-border px-2.5 py-1.5 text-xs font-medium hover:bg-nb-surface disabled:opacity-50';
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content className="fixed inset-0 z-30 flex min-w-0 flex-col gap-3 overflow-hidden bg-nb-canvas p-3 focus:outline-none">
          <div className="flex items-center justify-between gap-2">
            <Dialog.Title className="text-xl font-semibold">Plugins</Dialog.Title>
            <Dialog.Close aria-label="Close plugins" className="rounded-lg p-2 hover:bg-nb-surface"><CloseIcon size={18} /></Dialog.Close>
          </div>
          <Dialog.Description className="text-xs text-nb-muted">Connect and use apps from your Xroga account.</Dialog.Description>
          {selected ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto break-words">
              <button type="button" className={button} onClick={() => setSelected(undefined)}>Back to plugins</button>
              <h3 className="flex items-center gap-2 font-semibold"><PluginIcon plugin={selected} size={24} />{selected.name ?? selected.slug}</h3>
              {selected.description ? <p className="text-sm text-nb-muted">{selected.description}</p> : null}
              {isConnected(selected) ? (
                <button type="button" className={button} onClick={() => void chrome.tabs.create({
                  url: new URL('/dashboard/integrations/' + encodeURIComponent(selected.slug), WORKSPACE_ORIGIN).href,
                })}>Manage connection</button>
              ) : selected.canConnect && !selected.deprecated && !selected.noAuth && connectionsChecked ? (
                <button type="button" className={button} disabled={!!linkState} onClick={() => void connect(selected)}>
                  {linkState === 'pending' ? 'Authorization opened' : linkState === 'opening' ? 'Opening authorization…' : 'Connect'}
                </button>
              ) : <p className="text-xs text-nb-muted">{selected.noAuth ? 'No account is required for this toolkit.' : connectionsChecked ? 'Managed connection unavailable.' : 'Connection status unavailable.'}</p>}
              {linkState === 'pending' && !isConnected(selected) ? <p className="text-xs text-nb-muted">Finish authorization in Chrome, then return here to check the connection.</p> : null}
              {detailsError ? <p role="alert" className="text-xs text-nb-muted">{detailsError}</p> : null}
              <h4 className="text-sm font-medium">Available tool metadata</h4>
              {!details && !detailsError ? <p role="status" className="text-xs text-nb-muted">Loading tools…</p> : null}
              {details?.length ? <ul className="divide-y divide-nb-border rounded-lg border border-nb-border">
                {details.map(tool => <li key={tool.slug} className="p-2 text-xs">
                  <span className="font-medium">{tool.name ?? tool.slug}</span>
                  {tool.risk ? <span className="ml-2 text-nb-muted">{tool.risk}</span> : null}
                  {tool.scopes?.length ? <div className="mt-1 text-nb-muted">{tool.scopes.join(', ')}</div> : null}
                </li>)}
              </ul> : details ? <p className="text-xs text-nb-muted">No tool details are available.</p> : null}
            </div>
          ) : (
            <>
              <input type="search" value={query} maxLength={120} onChange={event => setQuery(event.target.value)}
                aria-label="Search plugins" placeholder="Search apps" className="rounded-lg border border-nb-border bg-nb-bg px-3 py-2 text-sm" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={button} aria-pressed={tab === 'discover'} onClick={() => setTab('discover')}>Discover</button>
                <button type="button" className={button} aria-pressed={tab === 'connected'} onClick={() => setTab('connected')}>
                  Connected{connectionsChecked ? ' (' + connected.length + ')' : ''}
                </button>
                <button type="button" className={button} onClick={() => setVersion(value => value + 1)}>Refresh</button>
              </div>
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                {tab === 'connected' && !connectionsChecked ? <li role="status" className="text-xs text-nb-muted">{connectionError || 'Checking connections…'}</li> : null}
                {tab === 'discover' && error ? <li role="alert" className="text-xs text-nb-muted">{error}</li> : null}
                {tab === 'discover' && loading && !filtered.length ? <li role="status" className="text-xs text-nb-muted">Loading plugins…</li> : null}
                {filtered.map(item => <li key={item.slug}>
                  <button type="button" onClick={() => setSelected(item)} className="w-full min-w-0 rounded-lg border border-nb-border p-2.5 text-left hover:bg-nb-surface">
                    <span className="flex items-center gap-2.5">
                      <PluginIcon plugin={item} />
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium">{item.name ?? item.slug}</span>
                        <span className="text-xs text-nb-muted">{isConnected(item) ? 'Connected' : item.noAuth ? 'No account required'
                          : !connectionsChecked ? 'Connection unchecked' : item.canConnect ? 'Available to connect' : 'Catalog listing'}</span>
                        {item.categories?.[0] ? <span className="ml-2 text-xs text-nb-muted">{item.categories[0].name}</span> : null}
                      </span>
                    </span>
                  </button>
                </li>)}
                {!filtered.length && (tab === 'discover' ? !loading && !error : connectionsChecked) ? <li className="text-xs text-nb-muted">No matching plugins.</li> : null}
                {tab === 'discover' && cursor ? <li><button type="button" className={button} disabled={loading} onClick={() => void loadMore()}>Load more</button></li> : null}
              </ul>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
