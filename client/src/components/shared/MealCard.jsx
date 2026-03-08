import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { formatDateShort } from '../../utils/dates';

function CategoryAvatar({ category }) {
  const colors = category === 'Uncategorised'
    ? 'bg-slate-500/10 text-slate-400'
    : 'bg-primary/10 text-primary';
  return (
    <div className={`size-16 rounded-xl flex items-center justify-center text-2xl font-black flex-shrink-0 ${colors}`}>
      {category.charAt(0)}
    </div>
  );
}

export default function MealCard({ meal, onMinus }) {
  const [busy, setBusy] = useState(false);
  const categoryName = useMemo(
    () => meal.mealie_category_name || 'Uncategorised',
    [meal.mealie_category_name]
  );

  async function handleMinus(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onMinus(meal);
    } finally {
      setBusy(false);
    }
  }

  // API returns earliest_freeze_date from MIN(b.freeze_date)
  const frozenLabel = meal.earliest_freeze_date
    ? `Frozen ${formatDateShort(meal.earliest_freeze_date)}`
    : null;

  return (
    <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
      <Link to={`/item/${meal.id}`} className="flex-shrink-0">
        <CategoryAvatar category={categoryName} />
      </Link>

      <Link to={`/item/${meal.id}`} className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <h3 className="font-bold text-sm truncate pr-2">{meal.name}</h3>
          <StatusBadge
            earliestExpiry={meal.earliest_expiry}
            totalPortions={meal.total_portions}
          />
        </div>
        <div className="flex gap-2 items-center mt-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight ${
            categoryName === 'Uncategorised' ? 'bg-slate-500/10 text-slate-400' : 'bg-primary/10 text-primary'
          }`}>
            {categoryName}
          </span>
          {frozenLabel && (
            <span className="text-[10px] text-slate-500">{frozenLabel}</span>
          )}
        </div>
      </Link>

      {/* Portions + quick remove */}
      <div className="flex flex-col items-center gap-1 bg-slate-800/50 px-2 py-1.5 rounded-lg border border-slate-800 flex-shrink-0">
        <span className="text-lg font-black leading-none">{meal.total_portions}</span>
        <button
          onClick={handleMinus}
          disabled={busy || meal.total_portions === 0}
          aria-label="Remove portions"
          className="size-12 bg-primary/20 text-primary rounded-md flex items-center justify-center hover:bg-primary/30 active:scale-95 transition-all disabled:opacity-30"
        >
          <Minus size={16} />
        </button>
      </div>
    </div>
  );
}
