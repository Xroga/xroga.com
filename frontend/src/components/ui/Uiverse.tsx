'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/* ── Gradient Get Started ── */
export function GradientStartButton({
  children = 'Get Started',
  onClick,
  className,
  type = 'button',
  disabled,
}: {
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn('xv-gradient-btn-wrapper', className)}>
      <div className="xv-light" />
      {[0, 0.15, 0.53, 0.45, 1.6, 1.6, 1.6].map((delay, i) => (
        <div
          key={i}
          className="xv-gradient-layer"
          style={{ animationDelay: `${delay}s`, animationDuration: `${15 + i * 2}s` }}
        />
      ))}
      <span className="xv-gradient-btn">{children}</span>
      <div className="xv-text-overlay">{children}</div>
    </button>
  );
}

/* ── Play Now auth CTA ── */
export function PlayNowButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn('xv-play-btn', className)}>
      <span>{children}</span>
    </button>
  );
}

/* ── Send arrow button ── */
export function SendDiscoverButton({ disabled, loading }: { disabled?: boolean; loading?: boolean }) {
  return (
    <button type="submit" disabled={disabled || loading} className="xv-send-btn" aria-label="Send">
      <svg xmlns="http://www.w3.org/2000/svg" width="38" height="15" viewBox="0 0 38 15" fill="none">
        <path
          fill="white"
          d="M10 7.519l-.939-.344h0l.939.344zm14.386-1.205l-.981-.192.981.192zm1.276 5.509l.537.843.148-.094.107-.139-.792-.611zm4.819-4.304l-.385-.923h0l.385.923zm7.227.707a1 1 0 0 0 0-1.414L31.343.448a1 1 0 0 0-1.414 0 1 1 0 0 0 0 1.414l5.657 5.657-5.657 5.657a1 1 0 0 0 1.414 1.414l6.364-6.364zM1 7.519l.554.833.029-.019.094-.061.361-.23 1.277-.77c1.054-.609 2.397-1.32 3.629-1.787.617-.234 1.17-.392 1.623-.455.477-.066.707-.008.788.034.025.013.031.021.039.034a.56.56 0 0 1 .058.235c.029.327-.047.906-.39 1.842l1.878.689c.383-1.044.571-1.949.505-2.705-.072-.815-.45-1.493-1.16-1.865-.627-.329-1.358-.332-1.993-.244-.659.092-1.367.305-2.056.566-1.381.523-2.833 1.297-3.921 1.925l-1.341.808-.385.245-.104.068-.028.018c-.011.007-.011.007.543.84zm8.061-.344c-.198.54-.328 1.038-.36 1.484-.032.441.024.94.325 1.364.319.45.786.64 1.21.697.403.054.824-.001 1.21-.09.775-.179 1.694-.566 2.633-1.014l3.023-1.554c2.115-1.122 4.107-2.168 5.476-2.524.329-.086.573-.117.742-.115s.195.038.161.014c-.15-.105.085-.139-.076.685l1.963.384c.192-.98.152-2.083-.74-2.707-.405-.283-.868-.37-1.28-.376s-.849.069-1.274.179c-1.65.43-3.888 1.621-5.909 2.693l-2.948 1.517c-.92.439-1.673.743-2.221.87-.276.064-.429.065-.492.057-.043-.006.066.003.155.127.07.099.024.131.038-.063.014-.187.078-.49.243-.94l-1.878-.689zm14.343-1.053c-.361 1.844-.474 3.185-.413 4.161.059.95.294 1.72.811 2.215.567.544 1.242.546 1.664.459a2.34 2.34 0 0 0 .502-.167l.15-.076.049-.028.018-.011c.013-.008.013-.008-.524-.852l-.536-.844.019-.012c-.038.018-.064.027-.084.032-.037.008.053-.013.125.056.021.02-.151-.135-.198-.895-.046-.734.034-1.887.38-3.652l-1.963-.384zm2.257 5.701l.791.611.024-.031.08-.101.311-.377 1.093-1.213c.922-.954 2.005-1.894 2.904-2.27l-.771-1.846c-1.31.547-2.637 1.758-3.572 2.725l-1.184 1.314-.341.414-.093.117-.025.032c-.01.013-.01.013.781.624zm5.204-3.381c.989-.413 1.791-.42 2.697-.307.871.108 2.083.385 3.437.385v-2c-1.197 0-2.041-.226-3.19-.369-1.114-.139-2.297-.146-3.715.447l.771 1.846z"
        />
      </svg>
    </button>
  );
}

/* ── Frutiger quick-action tab ── */
export function FrutigerButton({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="xv-frutiger-btn">
      <div className="xv-inner">
        <div className="xv-top-white" />
        {icon}
        <span className="xv-text">{children}</span>
      </div>
    </button>
  );
}

/* ── Connect / Manage ── */
export function ConnectButton({
  connected,
  onClick,
  label,
}: {
  connected?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('xv-connect-btn', connected && 'xv-manage')}
    >
      <div className="xv-connect-wrap">
        <div className="xv-connect-content">{label ?? (connected ? 'Manage' : 'Connect')}</div>
      </div>
    </button>
  );
}

/* ── Logout ── */
export function LogoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="xv-logout-btn" aria-label="Logout">
      <div className="xv-sign">
        <svg viewBox="0 0 512 512">
          <path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z" />
        </svg>
      </div>
      <div className="xv-logout-text">Logout</div>
    </button>
  );
}

/* ── Auth card shell ── */
export function AuthFormCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="xv-auth-card">
      <div className="xv-auth-heading">{title}</div>
      {children}
    </div>
  );
}

/* ── Plan cards ── */
export function GalacticPlanCard({
  name,
  price,
  actions,
  features,
  cta,
  current,
}: {
  name: string;
  price: string;
  actions: string;
  features?: string[];
  cta: ReactNode;
  current?: boolean;
}) {
  return (
    <div className="xv-plan-card">
      <div className="xv-plan-border" />
      <div>
        <span className="text-base font-bold">{name}</span>
        {current && <span className="ml-2 text-[10px] text-cyan-300 uppercase">Current</span>}
        <p className="text-2xl font-bold mt-1">
          {price}
          <span className="text-sm font-normal opacity-70">/mo</span>
        </p>
        <p className="text-xs opacity-70 mt-1">{actions}</p>
      </div>
      <hr className="border-white/10" />
      {features && (
        <ul className="space-y-1.5 text-xs">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-cyan-400 flex items-center justify-center text-[10px] text-black">✓</span>
              {f}
            </li>
          ))}
        </ul>
      )}
      {cta}
    </div>
  );
}

export function PopularPlanCard({
  name,
  price,
  description,
  actions,
  cta,
}: {
  name: string;
  price: string;
  description?: string;
  actions: string;
  cta: ReactNode;
}) {
  return (
    <div className="xv-popular-card h-full">
      <div className="xv-popular-badge">
        <p>MOST POPULAR</p>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10.277 16.515c.005-.11.187-.154.24-.058c.254.45.686 1.111 1.177 1.412c.49.3 1.275.386 1.791.408c.11.005.154.186.058.24c-.45.254-1.111.686-1.412 1.176s-.386 1.276-.408 1.792c-.005.11-.187.153-.24.057c-.254-.45-.686-1.11-1.176-1.411s-1.276-.386-1.792-.408c-.11-.005-.153-.187-.057-.24c.45-.254 1.11-.686 1.411-1.177c.301-.49.386-1.276.408-1.791m8.215-1c-.008-.11-.2-.156-.257-.062c-.172.283-.421.623-.697.793s-.693.236-1.023.262c-.11.008-.155.2-.062.257c.283.172.624.42.793.697s.237.693.262 1.023c.009.11.2.155.258.061c.172-.282.42-.623.697-.792s.692-.237 1.022-.262c.11-.009.156-.2.062-.258c-.283-.172-.624-.42-.793-.697s-.236-.692-.262-1.022" />
        </svg>
      </div>
      <div className="xv-popular-inner">
        <p className="xv-title">{name}</p>
        <p>
          <span className="xv-price">{price}</span>
          <span>/ month</span>
        </p>
        <p>{actions}</p>
        {description && <p className="text-[11px]">{description}</p>}
        {cta}
      </div>
    </div>
  );
}

export function SpinSubscribeButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="xv-spin-subscribe">
      <button type="button" className="xv-real-btn" onClick={onClick} disabled={disabled} aria-label={label} />
      <div className="xv-spin" />
      <div className="xv-spin-border">
        <div className="xv-spin-inner">{disabled ? 'Opening…' : label}</div>
      </div>
    </div>
  );
}

export function CheckoutAnimationCard({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="xv-checkout-card w-full text-left">
      <div className="xv-checkout-left">
        <div className="text-green-700 font-bold text-lg">$</div>
      </div>
      <div className="xv-checkout-right">{label}</div>
    </button>
  );
}

/* ── Poda chatbar shell ── */
export function PodaChatbarShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('xv-poda', className)}>
      <div className="xv-glow" />
      <div className="xv-dark-border" />
      <div className="xv-dark-border" />
      <div className="xv-white-ring" />
      <div className="xv-border-ring" />
      <div className="xv-poda-main">{children}</div>
    </div>
  );
}

/* ── Loader type detection ── */
export type LoaderKind = 'generating' | 'build' | 'search' | 'image';

export function detectLoaderKind(text: string): LoaderKind {
  const t = text.toLowerCase();
  if (/image|video|picture|photo|art|draw|illustrat/.test(t)) return 'image';
  if (/search|research|document|source|praise|web search|papers/.test(t)) return 'search';
  if (/build|website|app|software|game|movie|automate|code|debug/.test(t)) return 'build';
  return 'generating';
}

export function AiResponseLoader({ kind, word = 'Generating' }: { kind: LoaderKind; word?: string }) {
  if (kind === 'search') return <DocumentSearchLoader />;
  if (kind === 'build') return <BuildSiteLoader />;
  if (kind === 'image') return <PencilImageLoader />;
  return <GeneratingLoader word={word} />;
}

function GeneratingLoader({ word }: { word: string }) {
  const letters = word.split('');
  return (
    <div className="xv-gen-loader py-4">
      {letters.map((l, i) => (
        <span key={i} className="xv-gen-letter relative z-10">
          {l}
        </span>
      ))}
      <div className="xv-gen-ring" />
    </div>
  );
}

function DocumentSearchLoader() {
  const page = (
    <svg fill="currentColor" viewBox="0 0 90 120">
      <path d="M90,0 L90,120 L11,120 C4.92486775,120 0,115.075132 0,109 L0,11 C0,4.92486775 4.92486775,0 11,0 L90,0 Z M71.5,81 L18.5,81 C17.1192881,81 16,82.1192881 16,83.5 C16,84.8254834 17.0315359,85.9100387 18.3356243,85.9946823 L18.5,86 L71.5,86 C72.8807119,86 74,84.8807119 74,83.5 C74,82.1745166 72.9684641,81.0899613 71.6643757,81.0053177 L71.5,81 Z M71.5,57 L18.5,57 C17.1192881,57 16,58.1192881 16,59.5 C16,60.8254834 17.0315359,61.9100387 18.3356243,61.9946823 L18.5,62 L71.5,62 C72.8807119,62 74,60.8807119 74,59.5 C74,58.1192881 72.8807119,57 71.5,57 Z M71.5,33 L18.5,33 C17.1192881,33 16,34.1192881 16,35.5 C16,36.8254834 17.0315359,37.9100387 18.3356243,37.9946823 L18.5,38 L71.5,38 C72.8807119,38 74,36.8807119 74,35.5 C74,34.1192881 72.8807119,33 71.5,33 Z" />
    </svg>
  );
  return (
    <div className="xv-doc-loader mx-auto py-2">
      <div>
        <ul>
          {[1, 2, 3].map((n) => (
            <li key={n}>{page}</li>
          ))}
        </ul>
      </div>
      <span>Sourcing documents…</span>
    </div>
  );
}

function BuildSiteLoader() {
  return (
    <div className="xv-build-loader mx-auto py-2">
      <svg viewBox="0 0 400 120" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <rect x="120" y="20" width="160" height="90" rx="6" className="xv-browser-frame" />
        <rect x="130" y="35" width="140" height="10" rx="2" className="xv-skeleton" />
        <rect x="130" y="52" width="90" height="8" rx="2" className="xv-skeleton" />
        <rect x="130" y="65" width="140" height="30" rx="2" className="xv-skeleton" />
        <path d="M60 70 H120 V30" className="xv-trace" />
        <path d="M340 50 H280 V80" className="xv-trace" />
      </svg>
    </div>
  );
}

function PencilImageLoader() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className="xv-pencil-loader mx-auto py-2">
      <circle transform="rotate(-113,100,100)" strokeWidth="2" stroke="currentColor" fill="none" r="70" className="xv-pb1" />
      <g transform="translate(100,100)" className="xv-pr">
        <circle transform="rotate(-90)" strokeWidth="30" stroke="hsl(223,90%,50%)" fill="none" r="64" className="xv-pb1" />
      </g>
    </svg>
  );
}
