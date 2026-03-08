import { useState } from 'react';
import { CheckCircle, Snowflake, Layers, Package } from 'lucide-react';
import { notificationsApi } from '../../services/api';
import QuickCounter from '../shared/QuickCounter';
import { useSettings } from '../../hooks/useSettings';
import { buildExpiryMap } from '../../utils/expiry';

const DINNER_ACTIONS = [
  { key: 'ate_fresh',    icon: CheckCircle, color: 'text-blue-400',   label: 'Ate Fresh' },
  { key: 'froze_portions', icon: Snowflake, color: 'text-teal-400',  label: 'Froze Portions' },
  { key: 'ate_and_froze',  icon: Layers,    color: 'text-indigo-400', label: 'Ate + Froze Rest' },
  { key: 'used_freezer',   icon: Package,   color: 'text-orange-400', label: 'Used from Freezer' },
];

export default function DinnerPrompt({ prompt, onResolved }) {
  const rawSettings = useSettings();
  const expiryDays = buildExpiryMap(rawSettings);

  const [submitting, setSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'froze_portions' | 'ate_and_froze'
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

  function handleActionClick(key) {
    if (key === 'froze_portions' || key === 'ate_and_froze') {
      setPendingAction(key);
      setShowCounter(true);
    } else {
      resolve(key);
    }
  }

  async function handleCounterConfirm(count, freezeDate, expiryDate) {
    setShowCounter(false);
    await resolve(pendingAction, { portions: count, freeze_date: freezeDate, expiry_date: expiryDate });
  }

  return (
    <>
      <div className="rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5">
          <div className="mb-4">
            <span className="text-amber-500 text-xs font-bold uppercase tracking-widest">
              Tonight's Dinner
            </span>
            <h4 className="text-xl font-bold leading-tight mt-0.5">{prompt.meal_name}</h4>
            <p className="text-slate-400 text-sm font-medium mt-1">Status check: What happened?</p>
          </div>

          {error && <p className="text-red-400 text-xs mb-1">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            {DINNER_ACTIONS.map(({ key, icon: Icon, color, label }) => (
              <button
                key={key}
                disabled={submitting || (key === 'used_freezer' && prompt.freezer_stock === 0)}
                onClick={() => handleActionClick(key)}
                className="flex items-center justify-center gap-2 rounded-lg bg-slate-800 py-3 px-2 border border-transparent hover:border-primary/50 transition-all active:bg-primary/10 disabled:opacity-60 min-h-[48px]"
              >
                <Icon size={18} className={color} />
                <span className="text-[11px] leading-tight font-bold text-slate-300 text-center">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {showCounter && (
        <QuickCounter
          mode="add"
          meal={{ name: prompt.meal_name }}
          initialCount={2}
          expiryDays={expiryDays}
          onConfirm={handleCounterConfirm}
          onClose={() => setShowCounter(false)}
        />
      )}
    </>
  );
}
