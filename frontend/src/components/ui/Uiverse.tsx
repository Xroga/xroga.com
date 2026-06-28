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
      <span className="xv-gradient-btn" aria-hidden="true">
        {typeof children === 'string' ? children : ''}
      </span>
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
export function StaticQuickTab({
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
    <button type="button" onClick={onClick} disabled={disabled} className="xv-quick-tab">
      {icon}
      {children}
    </button>
  );
}

/** @deprecated use StaticQuickTab */
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

export function UpgradeProButton({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="xv-upgrade-pro">
      <span className="xv-upgrade-inner">
        <span className="xv-upgrade-text">
          <span>Upgrade to&nbsp;</span>
          <span className="pro">Spark & Pulse</span>
        </span>
        <span className="xv-upgrade-icon">
          <svg viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg">
            <path d="M214.6 41.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 141.2V448c0 17.7 14.3 32 32 32s32-14.3 32-32V141.2L329.4 246.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z" />
          </svg>
        </span>
      </span>
    </button>
  );
}

export function BuyNowButton({
  label = 'BUY NOW',
  onClick,
  disabled,
}: {
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="xv-buy-now">
      {disabled ? 'Opening…' : label}
      <svg fill="none" viewBox="0 0 24 24" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
        <path
          fill="white"
          d="M0.479167 11.5C0.203024 11.5 -0.0208333 11.7239 -0.0208333 12C-0.0208333 12.2761 0.203024 12.5 0.479167 12.5V11.5ZM22.9231 12.3536C23.1184 12.1583 23.1184 11.8417 22.9231 11.6464L19.7411 8.46447C19.5459 8.2692 19.2293 8.2692 19.034 8.46447C18.8388 8.65973 18.8388 8.97631 19.034 9.17157L21.8625 12L19.034 14.8284C18.8388 15.0237 18.8388 15.3403 19.034 15.5355C19.2293 15.7308 19.5459 15.7308 19.7411 15.5355L22.9231 12.3536ZM0.479167 12.5H22.5696V11.5H0.479167V12.5Z"
        />
      </svg>
    </button>
  );
}

export function DeleteExpandButton({ onClick, label = 'Delete' }: { onClick?: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="xv-delete-btn" aria-label={label}>
      <svg viewBox="0 0 448 512" className="xv-del-icon">
        <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z" />
      </svg>
    </button>
  );
}

export function QuotePageLoader() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--background)]/90 backdrop-blur-sm">
      <button type="button" className="xv-quote-loader" tabIndex={-1}>
        <span>XROGA AI: Defined by what we do.</span>
      </button>
    </div>
  );
}

export function SettingsTab({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={cn('xv-settings-tab', active && 'xv-active')}>
      {children}
    </button>
  );
}

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
  return <BuyNowButton label={label} onClick={onClick} disabled={disabled} />;
}

export function ChatbarShell({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('xv-chatbar-solid', className)} {...props}>
      {children}
    </div>
  );
}

/** @deprecated use ChatbarShell */
export const PodaChatbarShell = ChatbarShell;

export function AiResponseLoader({ word = 'Generating' }: { word?: string }) {
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
