import { useState } from 'react';
import { Snowflake, UtensilsCrossed, X, Minus, Plus } from 'lucide-react';
import { notificationsApi } from '../../services/api';

// Single recipe row with its own +/- defrost counter
function RecipeDefrostRow({ recipe, count, onChange }) {
  const canDefrost = recipe.freezer_stock > 0;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{recipe.meal_name}</p>
        <p className={`text-xs mt-0.5 ${canDefrost ? 'text-teal-400' : 'text-slate-500'}`}>
          {canDefrost
            ? `${recipe.freezer_stock} portion${recipe.freezer_stock !== 1 ? 's' : ''} in freezer`
            : 'Not in freezer'}
        </p>
      </div>
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
          onClick={() => onChange(Math.min(recipe.freezer_stock, count + 1))}
          disabled={!canDefrost || count >= recipe.freezer_stock}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors"
          aria-label={`Increase ${recipe.meal_name}`}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export default function LunchPrompt({ prompt, onResolved }) {
  // counts[i] = defrost count for prompt.recipes[i]
  const [counts, setCounts] = useState(() => (prompt.recipes ?? []).map(() => 0));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const anyStocked = prompt.recipes.some(r => r.freezer_stock > 0);
  const anyCounted = counts.some(c => c > 0);

  function setCount(index, value) {
    setCounts(prev => prev.map((c, i) => (i === index ? value : c)));
  }

  function handleDefrostAll() {
    setCounts(prompt.recipes.map(r =>
      r.freezer_stock > 0 ? Math.min(r.planned_quantity, r.freezer_stock) : 0
    ));
  }

  async function handleConfirm(action) {
    setSubmitting(true);
    setError(null);
    try {
      const resolutions = prompt.recipes.map((recipe, i) => {
        if (action === 'cooking_fresh') return { id: recipe.id, action: 'cooking_fresh' };
        if (action === 'skip') return { id: recipe.id, action: 'skip' };
        // defrost: skip items with count 0
        const count = counts[i];
        return count > 0
          ? { id: recipe.id, action: 'defrost', portions: count }
          : { id: recipe.id, action: 'skip' };
      });
      await notificationsApi.resolveGroup(resolutions);
      onResolved();
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
      <div className="p-5">
        {/* Header */}
        <div className="mb-4">
          <span className="text-primary text-xs font-bold uppercase tracking-widest">
            Tomorrow's Lunch
          </span>
          <p className="text-xs text-slate-500 mt-1">
            {prompt.recipes.map(r => r.meal_name).join(' + ')}
          </p>
        </div>

        {/* Per-recipe defrost counters */}
        <div className="divide-y divide-slate-800 mb-4">
          {prompt.recipes.map((recipe, i) => (
            <RecipeDefrostRow
              key={recipe.id}
              recipe={recipe}
              count={counts[i]}
              onChange={v => setCount(i, v)}
            />
          ))}
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex flex-col gap-2">
          {/* Primary: Defrost button */}
          <button
            disabled={submitting || !anyStocked || !anyCounted}
            onClick={() => handleConfirm('defrost')}
            className="flex w-full items-center justify-center rounded-lg h-12 bg-teal-600 hover:bg-teal-500 text-white gap-2 text-base font-bold transition-all shadow-lg shadow-teal-900/20 active:scale-[0.98] disabled:opacity-60"
          >
            <Snowflake size={18} />
            Defrost Selected
          </button>

          {/* Defrost All shortcut */}
          {anyStocked && (
            <button
              disabled={submitting}
              onClick={handleDefrostAll}
              className="flex w-full items-center justify-center rounded-lg h-10 border border-teal-800 text-teal-400 text-sm font-semibold hover:bg-teal-900/30 transition-colors disabled:opacity-60"
            >
              Defrost All ({prompt.recipes.filter(r => r.freezer_stock > 0).length})
            </button>
          )}

          <div className="flex gap-2 mt-1">
            <button
              disabled={submitting}
              onClick={() => handleConfirm('cooking_fresh')}
              className="flex-1 flex items-center justify-center rounded-lg h-10 border border-slate-700 bg-transparent text-slate-300 text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              <UtensilsCrossed size={14} className="mr-1.5" />
              Cooking Fresh
            </button>
            <button
              disabled={submitting}
              onClick={() => handleConfirm('skip')}
              className="flex-1 flex items-center justify-center rounded-lg h-10 bg-transparent text-slate-500 text-sm font-medium hover:text-slate-300 transition-colors disabled:opacity-60"
            >
              <X size={14} className="mr-1" />
              Skip Meal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
