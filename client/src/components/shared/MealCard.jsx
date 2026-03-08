import { Link } from 'react-router-dom';
import { Minus } from 'lucide-react';
import StatusBadge from './StatusBadge';

const CATEGORY_COLORS = {
  'Meals':       'bg-primary/10 text-primary',
  'Soups':       'bg-teal-500/10 text-teal-400',
  'Sauces':      'bg-orange-500/10 text-orange-400',
  'Baked Goods': 'bg-amber-500/10 text-amber-400',
  'Ingredients': 'bg-purple-500/10 text-purple-400',
  'Other':       'bg-slate-500/10 text-slate-400',
};

function CategoryAvatar({ category }) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];
  const initial = category.charAt(0).toUpperCase();
  return (
    <div className={`size-16 rounded-xl flex items-center justify-center text-2xl font-black flex-shrink-0 ${colors}`}>
      {initial}
    </div>
  );
}

function formatFreezeDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function MealCard({ meal, onMinus }) {
  const freezeDate = meal.earliest_expiry
    ? formatFreezeDate(
        // Use batch freeze date if available — fall back to created_at
        meal.freeze_date || meal.created_at
      )
    : null;

  return (
    <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
      <Link to={`/item/${meal.id}`} className="flex-shrink-0">
        <CategoryAvatar category={meal.category} />
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
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight ${CATEGORY_COLORS[meal.category] || ''}`}>
            {meal.category}
          </span>
          {freezeDate && (
            <span className="text-[10px] text-slate-500">Frozen {freezeDate}</span>
          )}
        </div>
      </Link>

      {/* Portions + quick remove */}
      <div className="flex flex-col items-center gap-1 bg-slate-800/50 p-1.5 rounded-lg border border-slate-800 flex-shrink-0">
        <span className="text-lg font-black leading-none">{meal.total_portions}</span>
        <button
          onClick={(e) => { e.preventDefault(); onMinus(meal); }}
          className="size-6 bg-primary/20 text-primary rounded-md flex items-center justify-center hover:bg-primary/30 active:scale-95 transition-all"
          title="Remove 1 portion"
        >
          <Minus size={14} />
        </button>
      </div>
    </div>
  );
}
