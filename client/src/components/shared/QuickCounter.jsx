import { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

// Bottom sheet overlay for specifying portion count
// mode: 'add' | 'remove'
export default function QuickCounter({ meal, mode = 'add', initialCount = 2, maxCount, onConfirm, onClose }) {
  const [count, setCount] = useState(initialCount);

  // Reset when meal changes
  useEffect(() => { setCount(initialCount); }, [initialCount]);

  const expiryLabel = (() => {
    if (mode !== 'add') return null;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 90);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  })();

  const canDecrease = count > 0;
  const canIncrease = maxCount == null || count < maxCount;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
        <div className="w-full max-w-md bg-bg-app rounded-t-2xl shadow-2xl border-t border-slate-800 overflow-hidden">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1.5 w-12 rounded-full bg-slate-700" />
          </div>

          {/* Title */}
          <div className="px-6 pt-4 pb-2 text-center">
            <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">
              {mode === 'add' ? 'Add Portions' : 'Remove Portions'}
            </p>
            <h2 className="text-xl font-bold">{meal?.name ?? ''}</h2>
          </div>

          {/* Counter */}
          <div className="flex items-center justify-between py-10 px-6 max-w-xs mx-auto w-full">
            <button
              onClick={() => canDecrease && setCount(c => c - 1)}
              disabled={!canDecrease}
              className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30"
            >
              <Minus size={28} />
            </button>

            <div className="flex flex-col items-center">
              <span className="text-7xl font-bold leading-none">{count}</span>
              <span className="text-slate-400 text-sm font-medium mt-1">portions</span>
            </div>

            <button
              onClick={() => canIncrease && setCount(c => c + 1)}
              disabled={!canIncrease}
              className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-30"
            >
              <Plus size={28} />
            </button>
          </div>

          {/* Date info (add mode only) */}
          {mode === 'add' && (
            <div className="px-6 py-4 flex flex-col gap-1 items-center bg-slate-800/30">
              <p className="text-slate-400 text-sm">
                Freeze date: <strong className="text-slate-200">Today</strong>
              </p>
              <p className="text-slate-500 text-xs">
                Expires: <strong className="text-slate-400">{expiryLabel}</strong> (~3 months)
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="p-6 pt-4 flex flex-col gap-3 safe-bottom">
            <button
              onClick={() => onConfirm(count)}
              disabled={count === 0}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-40"
            >
              {mode === 'add' ? 'Confirm Freezing' : `Remove ${count} Portion${count !== 1 ? 's' : ''}`}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 text-slate-400 font-medium text-sm hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
