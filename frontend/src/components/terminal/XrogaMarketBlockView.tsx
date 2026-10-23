'use client';

import React, { useState } from 'react';
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, Clock3, ExternalLink } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import { safeRichSourceUrl } from '@/lib/xrogaRichResults';
import type { XrogaBlock } from '@/lib/xrogaBlocks';

type MarketBlock = Extract<XrogaBlock, { type: 'market-quote' | 'conversion' }>;

function formatAmount(value: number, currency: string): string {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: value < 1 ? 6 : 2 }).format(value); }
  catch { return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value)} ${currency}`; }
}

function Evidence({ source }: { source: MarketBlock['source'] }) {
  const url = safeRichSourceUrl(source.url);
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--card-border)]/65 pt-3 text-xs text-[var(--muted)]"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Observed {new Date(source.observedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC</span>{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-500 hover:underline">{source.title}<ExternalLink className="h-3 w-3" aria-hidden="true" /></a> : <span>Source link unavailable</span>}</div>;
}

export function XrogaMarketBlockView({ block }: { block: XrogaBlock }) {
  const [amount, setAmount] = useState(block.type === 'conversion' ? String(block.amount) : '0');
  if (block.type !== 'conversion' && block.type !== 'market-quote') return null;
  if (block.state === 'loading') return <section className="xv-response-surface max-w-[900px] rounded-2xl border border-[var(--card-border)] p-5 text-sm text-[var(--muted)]" aria-busy="true">Waiting for a verified quote…</section>;
  if (block.state === 'error' || block.state === 'empty' || block.state === 'unsupported') return <section className="xv-response-surface max-w-[900px] rounded-2xl border border-[var(--card-border)] p-5 text-sm text-[var(--muted)]" role="status">A verified quote is not available. No value has been estimated.</section>;

  if (block.type === 'conversion') {
    const numericAmount = Number(amount);
    const result = Number.isFinite(numericAmount) && numericAmount >= 0 ? numericAmount * block.rate : null;
    return <section className="xv-response-surface max-w-[900px] rounded-2xl border border-blue-500/25 bg-[var(--background)]/80 p-4 shadow-sm sm:p-5" aria-label={block.title ?? 'Currency conversion'}>
      <div className="mb-4 flex items-center gap-2"><span className="rounded-lg bg-blue-500/10 p-2 text-blue-500"><ArrowRightLeft className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-500">Indicative conversion</p><h3 className="text-base font-semibold">{block.title ?? `${block.from} to ${block.to}`}</h3></div></div>
      <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]"><label className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3"><span className="block text-xs text-[var(--muted)]">From · {block.from}</span><input type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full bg-transparent text-2xl font-semibold outline-none" aria-label={`Amount in ${block.from}`} /></label><ArrowRightLeft className="mx-auto h-4 w-4 text-blue-500" aria-hidden="true" /><div className="rounded-xl border border-blue-500/25 bg-blue-500/[0.07] p-3"><span className="block text-xs text-[var(--muted)]">Estimated · {block.to}</span><output className="mt-1 block break-words text-2xl font-semibold">{result === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(result)}</output></div></div>
      <p className="my-3 text-xs text-[var(--muted)]">1 {block.from} = {new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(block.rate)} {block.to}. {block.feeNote ?? 'Displayed rate is a snapshot; a provider may use a different rate and charge fees.'} This does not execute a trade.</p><Evidence source={block.source} />
    </section>;
  }

  const rising = (block.changePercent ?? 0) >= 0;
  const Trend = rising ? ArrowUpRight : ArrowDownRight;
  return <section className="xv-response-surface max-w-[900px] rounded-2xl border border-blue-500/25 bg-[var(--background)]/80 p-4 shadow-sm sm:p-5" aria-label={block.title ?? `${block.name} market quote`}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-500">Observed market quote</p><h3 className="mt-1 text-lg font-semibold">{block.name} <span className="font-normal text-[var(--muted)]">{block.symbol}</span></h3><p className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{formatAmount(block.price, block.currency)}</p></div>{block.changePercent !== undefined ? <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${rising ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}><Trend className="h-4 w-4" aria-hidden="true" />{Math.abs(block.changePercent)}% {block.period ? `· ${block.period}` : ''}</span> : null}</div>
    {block.points?.length ? <div className="mt-4 h-36" role="img" aria-label={`${block.name} price history from ${block.points[0].label} to ${block.points[block.points.length - 1].label}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={block.points}><Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} /><Line dataKey="value" name={block.symbol} stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></div> : null}
    <div className="mt-4"><Evidence source={block.source} /></div>
  </section>;
}
