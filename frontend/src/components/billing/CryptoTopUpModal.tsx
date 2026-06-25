'use client';

import { useState } from 'react';
import { CRYPTO_ACTION_PACKS } from '@/lib/plans';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { X, Bitcoin } from 'lucide-react';

interface CryptoTopUpModalProps {
  open: boolean;
  onClose: () => void;
}

export function CryptoTopUpModal({ open, onClose }: CryptoTopUpModalProps) {
  const [loading, setLoading] = useState<string | null>(null);

  if (!open) return null;

  async function handlePurchase(packId: string) {
    setLoading(packId);
    try {
      const { chargeUrl } = await api.billing.createCryptoCharge(packId);
      window.open(chargeUrl, '_blank');
      toast.success('Payment page opened — complete payment to receive Actions');
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bitcoin className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold">Top Up with Crypto</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-[var(--muted)] mb-4">
          Pay with USDC or USDT via Coinbase Commerce. Actions are added instantly on confirmation.
        </p>
        <div className="space-y-2">
          {CRYPTO_ACTION_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              disabled={loading === pack.id}
              onClick={() => handlePurchase(pack.id)}
              className="w-full flex items-center justify-between p-4 rounded-lg border border-[var(--card-border)] hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-colors disabled:opacity-50"
            >
              <span className="font-medium">{pack.actions.toLocaleString()} Actions</span>
              <span className="text-cyan-300">${pack.usd}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
