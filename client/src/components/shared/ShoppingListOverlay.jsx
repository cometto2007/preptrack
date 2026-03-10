import { useState, useMemo } from 'react';
import { X, ShoppingCart, Plus, Minus } from 'lucide-react';
import { ticktickApi } from '../../services/api';

/**
 * ShoppingListOverlay - Selection overlay for adding recipes to TickTick shopping list.
 * 
 * Features:
 * - Checkbox list of recipes in a grouped meal
 * - Per-recipe portion adjustment with +/- buttons
 * - Full recipe yield (recipeServings) as default
 * - Ingredient scaling based on selected portions
 * 
 * Props:
 * - recipes: Array of { slug, name, recipeServings?, imageUrl?, quantity? }
 * - onClose: () => void
 * - onAdded: ({ added, merged }) => void - callback when successfully added
 */
// Guard wrapper — never mounts the inner component when there's nothing to show,
// avoiding a hooks-before-return violation.
export default function ShoppingListOverlay({ recipes, onClose, onAdded }) {
  if (!recipes || recipes.length === 0) return null;
  return <ShoppingListOverlayInner recipes={recipes} onClose={onClose} onAdded={onAdded} />;
}

function ShoppingListOverlayInner({ recipes, onClose, onAdded }) {
  // Initialize selections - only check recipes with missing/low stock by default
  const [selections, setSelections] = useState(() => {
    return recipes.map(r => ({
      slug: r.slug,
      name: r.name,
      // Only check by default if stock is missing or low
      checked: r.status === 'missing' || r.status === 'low' || r.status === 'partial',
      portions: (r.recipeServings && r.recipeServings > 0 ? r.recipeServings : 1) * (r.quantity || 1), // Default to recipe yield × planned quantity
      recipeServings: r.recipeServings && r.recipeServings > 0 ? r.recipeServings : 1,
      imageUrl: r.imageUrl,
      quantity: r.quantity || 1, // From meal plan (e.g., ×2 if recipe appears twice)
      status: r.status || 'missing',
    }));
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const anyChecked = selections.some(s => s.checked);

  // Calculate total portions — s.portions already includes the quantity multiplier
  const totals = useMemo(() => {
    return selections.reduce((acc, s) => {
      if (s.checked) {
        acc.totalPortions += s.portions;
        acc.recipeCount += 1;
      }
      return acc;
    }, { totalPortions: 0, recipeCount: 0 });
  }, [selections]);

  function toggleChecked(index) {
    setSelections(prev => prev.map((s, i) => 
      i === index ? { ...s, checked: !s.checked } : s
    ));
  }

  function setPortions(index, value) {
    const portions = Math.max(1, Math.min(99, value));
    setSelections(prev => prev.map((s, i) => 
      i === index ? { ...s, portions } : s
    ));
  }

  function adjustPortions(index, delta) {
    setSelections(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const newPortions = Math.max(1, Math.min(99, s.portions + delta));
      return { ...s, portions: newPortions };
    }));
  }

  function setAllToDefault() {
    setSelections(prev => prev.map(s => ({
      ...s,
      checked: true,
      portions: s.recipeServings * s.quantity, // match the initial default
    })));
  }

  function clearAll() {
    setSelections(prev => prev.map(s => ({ ...s, checked: false })));
  }

  async function handleConfirm() {
    if (!anyChecked) return;
    
    setSubmitting(true);
    setError(null);

    try {
      const recipesToAdd = selections
        .filter(s => s.checked)
        .map(s => ({
          slug: s.slug,
          recipeName: s.name,
          // Send total portions (base portions × planned quantity) for proper scaling
          portions: s.portions,
        }));

      const result = await ticktickApi.addToShoppingListBatch(recipesToAdd);
      onAdded(result);
      onClose();
    } catch (err) {
      console.error('[ShoppingListOverlay] error:', err);
      setError(err.message || 'Failed to add to shopping list. Is TickTick configured?');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45]" 
        onClick={onClose}
        role="presentation"
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
        <div 
          className="w-full max-w-md bg-bg-app rounded-t-2xl shadow-2xl border-t border-slate-800 overflow-hidden flex flex-col max-h-[85vh]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shopping-list-title"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="h-1.5 w-12 rounded-full bg-slate-700" />
          </div>

          {/* Header */}
          <div className="px-5 pt-3 pb-4 border-b border-slate-800 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 
                  id="shopping-list-title"
                  className="text-lg font-bold flex items-center gap-2"
                >
                  <ShoppingCart size={20} className="text-primary" />
                  Add to Shopping List
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  {totals.recipeCount} recipe{totals.recipeCount !== 1 ? 's' : ''} · {totals.totalPortions} portions
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={setAllToDefault}
                className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-800 transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 text-xs font-medium hover:bg-slate-800 transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Recipe list */}
          <div className="flex-1 overflow-y-auto px-5 py-3">
            <div className="space-y-3">
              {selections.map((selection, index) => (
                <div 
                  key={selection.slug}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    selection.checked 
                      ? 'bg-slate-800/50 border-slate-700' 
                      : 'bg-transparent border-slate-800/50 opacity-60'
                  }`}
                >
                  {/* Checkbox — 48px tap target wrapping 24px visual */}
                  <button
                    type="button"
                    onClick={() => toggleChecked(index)}
                    className="w-12 h-12 flex items-center justify-center shrink-0 -ml-3"
                    aria-label={selection.checked ? 'Deselect' : 'Select'}
                  >
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                      selection.checked
                        ? 'bg-primary text-white'
                        : 'bg-slate-800 border border-slate-600'
                    }`}>
                      {selection.checked && (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                  </button>

                  {/* Recipe image */}
                  {selection.imageUrl ? (
                    <img
                      src={selection.imageUrl}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0 bg-slate-800"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg shrink-0 bg-slate-800" />
                  )}

                  {/* Recipe info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{selection.name}</p>
                    <p className="text-xs text-slate-500">
                      Yield: {selection.recipeServings} portions
                      {selection.quantity > 1 && (
                        <span className="text-slate-400"> (×{selection.quantity} planned)</span>
                      )}
                    </p>
                  </div>

                  {/* Portion counter (only when checked) */}
                  {selection.checked && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => adjustPortions(index, -1)}
                        disabled={selection.portions <= 1}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors"
                        aria-label="Decrease portions"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={selection.portions}
                        onChange={(e) => setPortions(index, parseInt(e.target.value, 10) || 1)}
                        className="w-12 text-center bg-transparent text-sm font-bold tabular-nums focus:outline-none"
                        aria-label="Portions"
                      />
                      <button
                        type="button"
                        onClick={() => adjustPortions(index, 1)}
                        disabled={selection.portions >= 99}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors"
                        aria-label="Increase portions"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-5 border-t border-slate-800 shrink-0 safe-bottom">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || !anyChecked}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <ShoppingCart size={18} />
              {submitting ? 'Adding...' : `Add ${totals.recipeCount} Recipe${totals.recipeCount !== 1 ? 's' : ''}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 mt-2 text-slate-400 font-medium text-sm hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
