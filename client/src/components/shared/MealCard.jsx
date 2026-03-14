import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { getExpiryInfo } from './StatusBadge';

const expiryColorMap = {
  red:   'bg-red-500/10 text-red-400',
  amber: 'bg-amber-500/10 text-amber-400',
  green: 'bg-green-500/10 text-green-400',
};

function MealImage({ meal, categoryName }) {
  const [imgError, setImgError] = useState(false);
  const colors = categoryName === 'Uncategorised'
    ? 'bg-slate-700/50 text-slate-400'
    : 'bg-primary/20 text-primary';
  const fallback = (
    <div className={`w-full h-full flex items-center justify-center text-2xl font-black ${colors}`}>
      {categoryName.charAt(0)}
    </div>
  );
  if (!meal.image_url || imgError) return fallback;
  return (
    <img
      src={meal.image_url}
      alt={meal.name}
      className="w-full h-full object-cover"
      onError={() => setImgError(true)}
    />
  );
}

export default function MealCard({ meal, mealieUrl, onDecrement, onIncrement, onCounterTap }) {
  const [busy, setBusy] = useState(false);
  const categoryName = useMemo(
    () => meal.mealie_category_name || 'Uncategorised',
    [meal.mealie_category_name]
  );
  const expiryInfo = useMemo(
    () => (meal.earliest_expiry ? getExpiryInfo(meal.earliest_expiry) : null),
    [meal.earliest_expiry]
  );

  async function handleDecrement(e) {
    e.preventDefault();
    if (busy || meal.total_portions === 0) return;
    setBusy(true);
    try { await onDecrement?.(meal); } finally { setBusy(false); }
  }

  const portionLabel = meal.total_portions === 1 ? 'portion' : 'portions';
  const showExpiry = expiryInfo && meal.total_portions > 0;

  return (
    <div className="
      bg-slate-800/50 border border-slate-700/10 rounded-xl overflow-hidden
      hover:border-slate-700/30 transition-colors
      flex gap-4 items-center p-4
      md:flex-col md:items-stretch md:gap-0 md:p-0
    ">
      {/* Image */}
      <Link
        to={`/item/${meal.id}`}
        className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden md:w-full md:aspect-video md:h-auto md:rounded-none"
      >
        <MealImage meal={meal} categoryName={categoryName} />
      </Link>

      {/* Content */}
      <div className="flex-1 min-w-0 md:p-5 md:flex md:flex-col md:gap-3">

        {/* Name — single line, truncated */}
        <Link to={`/item/${meal.id}`} className="block md:h-6 md:overflow-hidden">
          <h4 className="font-semibold text-sm md:text-base truncate leading-6">{meal.name}</h4>
        </Link>

        {/* Badges — mobile only */}
        <div className="flex items-center gap-2 mb-2 md:hidden">
          {showExpiry && (
            <span className={`px-2 py-0.5 ${expiryColorMap[expiryInfo.color]} text-[10px] font-medium rounded-full whitespace-nowrap`}>
              {expiryInfo.label}
            </span>
          )}
          <span className="px-2 py-0.5 bg-slate-700/30 text-slate-400 text-[10px] rounded-full truncate">
            {categoryName}
          </span>
        </div>

        {/* Count + buttons — fixed height */}
        <div className="flex items-center justify-between md:h-10">
          <button
            onClick={e => { e.preventDefault(); onCounterTap?.(meal); }}
            aria-label={`${meal.total_portions} ${portionLabel} — tap to adjust`}
            className="flex items-center gap-1.5 hover:opacity-75 transition-opacity"
          >
            <span className="text-2xl md:text-3xl font-bold">{meal.total_portions}</span>
            <span className="text-slate-400 text-xs md:text-sm whitespace-nowrap">{portionLabel}</span>
          </button>

          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            <button
              onClick={e => { e.preventDefault(); onIncrement?.(meal); }}
              aria-label="Add batch"
              className="w-8 h-8 md:w-10 md:h-10 bg-slate-700/50 hover:bg-slate-700 text-slate-200 rounded-full md:rounded-lg flex items-center justify-center transition-colors active:scale-95"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={handleDecrement}
              disabled={busy || meal.total_portions === 0}
              aria-label="Use 1 portion"
              className="w-8 h-8 md:w-10 md:h-10 bg-slate-700/50 hover:bg-slate-700 text-slate-200 rounded-full md:rounded-lg flex items-center justify-center transition-colors active:scale-95 disabled:opacity-30"
            >
              <Minus size={14} />
            </button>
          </div>
        </div>

        {/* Badges — desktop/tablet, fixed height, no wrapping */}
        <div className="hidden md:flex items-center justify-between h-7 overflow-hidden">
          {showExpiry ? (
            <span className={`px-2.5 py-1 ${expiryColorMap[expiryInfo.color]} text-xs font-medium rounded-full whitespace-nowrap flex-shrink-0`}>
              {expiryInfo.label}
            </span>
          ) : <span />}
          <span className="px-2.5 py-1 bg-slate-700/30 text-slate-400 text-xs rounded-full truncate max-w-[55%] text-right">
            {categoryName}
          </span>
        </div>

        {/* Mealie link — fixed height so absent link doesn't collapse spacing */}
        <div className="hidden md:block h-4">
          {mealieUrl && meal.mealie_recipe_slug && (
            <a
              href={`${mealieUrl}/g/home/r/${meal.mealie_recipe_slug}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-primary text-xs hover:underline"
            >
              View in Mealie ↗
            </a>
          )}
        </div>

      </div>
    </div>
  );
}
