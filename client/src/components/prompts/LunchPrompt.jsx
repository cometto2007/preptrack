import { useState } from 'react';
import { Snowflake, UtensilsCrossed, X } from 'lucide-react';
import { notificationsApi } from '../../services/api';
import QuickCounter from '../shared/QuickCounter';
import { useSettings } from '../../hooks/useSettings';
import { buildExpiryMap } from '../../utils/expiry';

export default function LunchPrompt({ prompt, onResolved }) {
  const rawSettings = useSettings();
  const expiryDays = buildExpiryMap(rawSettings);

  const [submitting, setSubmitting] = useState(false);
  const [showCounter, setShowCounter] = useState(false);
  const [error, setError] = useState(null);

  async function resolve(action, extra = {}) {
    setSubmitting(true);
    setError(null);
    try {
      await notificationsApi.resolve(prompt.id, { action, ...extra });
      onResolved();
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDefrost(count, freezeDate, expiryDate) {
    setShowCounter(false);
    await resolve('defrost', { portions: count });
  }

  return (
    <>
      <div className="rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-primary text-xs font-bold uppercase tracking-widest">
                Tomorrow's Lunch
              </span>
              <h4 className="text-xl font-bold leading-tight">{prompt.meal_name}</h4>
              <div className="flex items-center gap-1.5 mt-1 text-slate-400">
                <Snowflake size={13} className="text-teal-400 shrink-0" />
                <p className="text-xs font-medium">
                  {prompt.freezer_stock} portion{prompt.freezer_stock !== 1 ? 's' : ''} in freezer
                </p>
              </div>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs mb-1">{error}</p>}
          <div className="flex flex-col gap-3">
            <button
              disabled={submitting || prompt.freezer_stock === 0}
              onClick={() => setShowCounter(true)}
              className="flex w-full items-center justify-center rounded-lg h-12 bg-teal-600 hover:bg-teal-500 text-white gap-2 text-base font-bold transition-all shadow-lg shadow-teal-900/20 active:scale-[0.98] disabled:opacity-60"
            >
              <Snowflake size={18} />
              Defrost {prompt.freezer_stock >= 2 ? 2 : prompt.freezer_stock}
            </button>
            <div className="flex gap-2">
              <button
                disabled={submitting}
                onClick={() => resolve('cooking_fresh')}
                className="flex-1 flex items-center justify-center rounded-lg h-10 border border-slate-700 bg-transparent text-slate-300 text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                <UtensilsCrossed size={14} className="mr-1.5" />
                Cooking Fresh
              </button>
              <button
                disabled={submitting}
                onClick={() => resolve('skip')}
                className="flex-1 flex items-center justify-center rounded-lg h-10 bg-transparent text-slate-500 text-sm font-medium hover:text-slate-300 transition-colors disabled:opacity-60"
              >
                <X size={14} className="mr-1" />
                Skip Meal
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCounter && (
        <QuickCounter
          mode="remove"
          meal={{ name: prompt.meal_name }}
          initialCount={Math.min(2, prompt.freezer_stock)}
          maxCount={prompt.freezer_stock}
          expiryDays={expiryDays}
          onConfirm={handleDefrost}
          onClose={() => setShowCounter(false)}
        />
      )}
    </>
  );
}
