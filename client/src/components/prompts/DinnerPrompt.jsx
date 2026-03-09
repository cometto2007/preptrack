import { useState } from 'react';
import { CheckCircle, Snowflake, Layers, Package, Minus, Plus } from 'lucide-react';
import { notificationsApi } from '../../services/api';
import { useSettings } from '../../hooks/useSettings';
import { buildExpiryMap } from '../../utils/expiry';

const DINNER_ACTIONS = [
  { key: 'ate_fresh',      icon: CheckCircle, color: 'text-blue-400',   label: 'Ate Fresh' },
  { key: 'froze_portions', icon: Snowflake,   color: 'text-teal-400',   label: 'Froze Portions' },
  { key: 'ate_and_froze',  icon: Layers,      color: 'text-indigo-400', label: 'Ate + Froze Rest' },
  { key: 'used_freezer',   icon: Package,     color: 'text-orange-400', label: 'Used from Freezer' },
];

// Inline per-recipe counter row for Froze Portions / Used Freezer steps
function RecipeCountRow({ recipe, count, onChange, maxCount }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <p className="flex-1 min-w-0 text-sm font-semibold truncate">{recipe.meal_name}</p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onChange(Math.max(0, count - 1))}
          disabled={count === 0}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors"
          aria-label={`Decrease ${recipe.meal_name}`}
        >
          <Minus size={14} />
        </button>
        <span className="w-6 text-center text-sm font-bold tabular-nums">{count}</span>
        <button
          onClick={() => onChange(maxCount != null ? Math.min(maxCount, count + 1) : count + 1)}
          disabled={maxCount != null && count >= maxCount}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors"
          aria-label={`Increase ${recipe.meal_name}`}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export default function DinnerPrompt({ prompt, onResolved }) {
  const rawSettings = useSettings();
  const expiryDays = buildExpiryMap(rawSettings);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Step: null = action selection, 'froze_portions' | 'ate_and_froze' | 'used_freezer' = counter step
  const [step, setStep] = useState(null);
  const [counts, setCounts] = useState(() => prompt.recipes.map(() => 0));

  const anyStocked = prompt.recipes.some(r => r.freezer_stock > 0);
  const anyCounted = counts.some(c => c > 0);

  function setCount(index, value) {
    setCounts(prev => prev.map((c, i) => (i === index ? value : c)));
  }

  // Compute expiry date from today + default_expiry_days
  function computeExpiryDate() {
    const days = Object.values(expiryDays)[0] ?? 90;
    const now = new Date();
    const exp = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
    return `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}-${String(exp.getDate()).padStart(2, '0')}`;
  }

  async function resolveAll(action, extra = {}) {
    setSubmitting(true);
    setError(null);
    try {
      let resolutions;
      if (action === 'froze_portions' || action === 'ate_and_froze') {
        const expiryDate = extra.expiry_date || computeExpiryDate();
        resolutions = prompt.recipes.map((recipe, i) => {
          const qty = counts[i];
          return qty > 0
            ? { id: recipe.id, action, portions: qty, expiry_date: expiryDate }
            : { id: recipe.id, action: 'skip' };
        });
      } else if (action === 'used_freezer') {
        resolutions = prompt.recipes.map((recipe, i) => {
          const qty = counts[i];
          return qty > 0
            ? { id: recipe.id, action: 'used_freezer', portions: qty }
            : { id: recipe.id, action: 'skip' };
        });
      } else {
        // ate_fresh, skip
        resolutions = prompt.recipes.map(recipe => ({ id: recipe.id, action }));
      }
      await notificationsApi.resolveGroup(resolutions);
      onResolved();
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleActionClick(key) {
    if (key === 'froze_portions' || key === 'ate_and_froze' || key === 'used_freezer') {
      // Reset counters and show per-recipe counter step
      setCounts(prompt.recipes.map(() => 0));
      setStep(key);
    } else {
      resolveAll(key);
    }
  }

  const mealTitle = prompt.recipes.map(r => r.meal_name).join(' + ');

  // Counter step: show per-recipe +/- rows
  if (step) {
    const isUseFreezer = step === 'used_freezer';
    const label = step === 'froze_portions' ? 'Froze Portions'
      : step === 'ate_and_froze' ? 'Ate + Froze Rest'
      : 'Used from Freezer';

    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5">
          <div className="mb-4">
            <span className="text-amber-500 text-xs font-bold uppercase tracking-widest">
              {label}
            </span>
            <p className="text-xs text-slate-500 mt-1 truncate">{mealTitle}</p>
          </div>

          <div className="divide-y divide-slate-800 mb-4">
            {prompt.recipes.map((recipe, i) => (
              <RecipeCountRow
                key={recipe.id}
                recipe={recipe}
                count={counts[i]}
                onChange={v => setCount(i, v)}
                maxCount={isUseFreezer ? recipe.freezer_stock : null}
              />
            ))}
          </div>

          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

          <div className="flex gap-2">
            <button
              disabled={submitting}
              onClick={() => setStep(null)}
              className="flex-1 flex items-center justify-center rounded-lg h-12 border border-slate-700 text-slate-400 text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              Back
            </button>
            <button
              disabled={submitting || !anyCounted}
              onClick={() => resolveAll(step)}
              className="flex-1 flex items-center justify-center rounded-lg h-12 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold transition-all shadow-lg shadow-teal-900/20 active:scale-[0.98] disabled:opacity-60"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default step: action selection
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="mb-4">
          <span className="text-amber-500 text-xs font-bold uppercase tracking-widest">
            Tonight's Dinner
          </span>
          <p className="text-sm font-bold mt-0.5 truncate">{mealTitle}</p>
          <p className="text-slate-400 text-sm font-medium mt-1">What happened?</p>
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          {DINNER_ACTIONS.map(({ key, icon: Icon, color, label }) => (
            <button
              key={key}
              disabled={submitting || (key === 'used_freezer' && !anyStocked)}
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
  );
}
