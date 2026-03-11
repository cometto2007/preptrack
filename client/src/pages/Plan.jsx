import { useMemo, useState } from 'react';
import { Plus, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMealiePlan } from '../hooks/useMealiePlan';
import { localDateStr, formatDateShort } from '../utils/dates';
import ShoppingListOverlay from '../components/shared/ShoppingListOverlay';

function statusBadge(status, portions) {
  if (status === 'covered') {
    return {
      label: 'Covered',
      note: portions > 0 ? `In freezer (${portions})` : 'In freezer',
      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    };
  }
  if (status === 'low') {
    return {
      label: 'Low',
      note: portions > 0 ? `${portions} left` : 'Running low',
      cls: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
    };
  }
  if (status === 'partial') {
    return {
      label: 'Partial',
      note: 'Some recipes missing',
      cls: 'bg-orange-500/15 text-orange-300 border-orange-400/30',
    };
  }
  if (status === 'missing') {
    return {
      label: 'Missing',
      note: 'Not in freezer',
      cls: 'bg-[#e45757] text-white border-[#f07b7b]',
    };
  }
  return null;
}

function slotSubtitle(slot) {
  if (slot.status === 'off') return 'Off';
  if (slot.status === 'unplanned') return 'Not planned yet';
  const count = slot.recipes?.length || 0;
  return `${count} recipe${count === 1 ? '' : 's'} planned`;
}

function RecipeItem({ recipe, isPast, compact = false }) {
  const navigate = useNavigate();
  const badge = statusBadge(recipe.status, recipe.portions);

  return (
    <div className={`bg-bg-app rounded-lg border border-[#243b56] min-w-0 flex items-center ${compact ? 'p-2 gap-2' : 'p-2.5 gap-2.5'}`}>
      {recipe.recipeId ? (
        <img
          src={`/api/mealie/recipe-image/${recipe.recipeId}`}
          alt={recipe.name}
          className={`${compact ? 'w-9 h-9' : 'w-10 h-10'} rounded-md object-cover bg-[#1f3249] shrink-0`}
        />
      ) : (
        <div className={`${compact ? 'w-9 h-9' : 'w-10 h-10'} rounded-md bg-[#1f3249] shrink-0`} />
      )}
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className={`${compact ? 'text-[13px]' : 'text-sm'} font-medium truncate`}>{recipe.name}</div>
        <div className="flex items-center gap-1.5 min-w-0">
          {badge && (
            <span className={`h-5 px-1.5 rounded-full border inline-flex items-center text-[10px] font-bold uppercase ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          {recipe.quantity > 1 && <span className="text-[11px] text-[#8ea3bb]">x{recipe.quantity}</span>}
          {badge?.note && <span className="text-[11px] text-[#8ea3bb] truncate">{badge.note}</span>}
        </div>
      </div>
      {recipe.status === 'missing' && !isPast && (
        <button
          onClick={() => navigate('/add', {
            state: {
              name: recipe.name || '',
              mealieSlug: recipe.slug || null,
            },
          })}
          className="h-7 px-2 rounded-md border border-[#243b56] bg-[#1f3249] text-[#dce7f3] text-xs font-semibold inline-flex items-center gap-1 hover:border-primary/50 hover:text-primary transition-colors"
        >
          <Plus size={12} /> Add
        </button>
      )}
    </div>
  );
}

function MealCard({ dayDate, slot, isPast, compact = false }) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [listStatus, setListStatus] = useState(null);
  const hasRecipes = slot.recipes && slot.recipes.length > 0;
  const title = slot.type.charAt(0).toUpperCase() + slot.type.slice(1);

  function handleAddedLocal() {
    setListStatus('ok');
    setTimeout(() => setListStatus(null), 3000);
  }

  if (slot.status === 'off') {
    return (
      <article className="rounded-xl p-3 bg-[#0c1724]/70 border border-[#243b56]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-[#c6d4e2]">{title}</h4>
            <p className="text-xs text-[#6f849b]">Off</p>
          </div>
          <span className="text-[10px] uppercase text-[#6f849b] bg-[#1f3249] px-2 py-1 rounded-full border border-[#243b56]">Off</span>
        </div>
      </article>
    );
  }

  return (
    <article className={`rounded-xl border ${slot.status === 'unplanned' ? 'bg-[#0c1724]/70 border-[#243b56]' : 'bg-[#0c1724] border-[#243b56]'} ${compact ? 'p-3.5' : 'p-3'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className={`${compact ? 'text-base' : 'text-[15px]'} font-semibold`}>{title}</h4>
          <p className="text-xs text-[#8ea3bb]">{slotSubtitle(slot)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasRecipes && (
            <>
              <span className="h-6 px-2 rounded-full bg-[#1f3249] border border-[#243b56] text-[11px] text-[#c6d4e2] inline-flex items-center">
                {slot.recipes.length} item{slot.recipes.length === 1 ? '' : 's'}
              </span>
              <button
                onClick={() => setShowOverlay(true)}
                disabled={isPast}
                className={`w-8 h-8 rounded-md border inline-flex items-center justify-center transition-colors ${
                  listStatus === 'ok'
                    ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300'
                    : 'bg-[#1f3249] border-[#243b56] text-[#c6d4e2] hover:text-primary hover:border-primary/40'
                } disabled:opacity-50`}
                title={isPast ? 'Past day' : 'Add ingredients to shopping list'}
              >
                <ShoppingCart size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {slot.status === 'unplanned' && (
        <div className="mt-3 rounded-lg p-3 bg-bg-app border border-[#243b56]">
          <div className="text-sm font-medium">Empty</div>
          <div className="text-xs text-[#8ea3bb] mt-0.5">No {slot.type} selected</div>
        </div>
      )}

      {hasRecipes && (
        <div className="mt-3 flex flex-col gap-2">
          {slot.recipes.map(recipe => (
            <RecipeItem
              key={recipe.slug ?? recipe.recipeId ?? `${dayDate}-${slot.type}-${recipe.name}`}
              recipe={recipe}
              isPast={isPast}
              compact={compact}
            />
          ))}
        </div>
      )}

      {showOverlay && hasRecipes && (
        <ShoppingListOverlay
          recipes={slot.recipes.map(r => ({
            slug: r.slug,
            name: r.name,
            recipeServings: r.recipeServings,
            imageUrl: r.recipeId ? `/api/mealie/recipe-image/${r.recipeId}` : null,
            quantity: r.quantity || 1,
            status: r.status,
          }))}
          onClose={() => setShowOverlay(false)}
          onAdded={handleAddedLocal}
        />
      )}
    </article>
  );
}

function DaySectionMobile({ day, today }) {
  const isPast = day.date < today;
  const isToday = day.date === today;
  const hasAnyPlanned = day.slots.some(slot => slot.status !== 'off' && slot.status !== 'unplanned');

  return (
    <section className={`space-y-3 ${isPast ? 'opacity-65' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${isToday ? 'bg-primary' : hasAnyPlanned ? 'bg-[#4d6074]' : 'bg-[#2c4259]'}`} />
        <span className="text-xs font-bold uppercase tracking-wider text-[#c6d4e2]">
          {formatDateShort(day.date).toUpperCase()}{isToday ? ' · Today' : ''}
        </span>
        <div className="h-px flex-1 bg-[#1f3249]" />
      </div>
      <div className="space-y-2.5">
        {day.slots.map(slot => (
          <MealCard key={`${day.date}-${slot.type}`} dayDate={day.date} slot={slot} isPast={isPast} />
        ))}
      </div>
    </section>
  );
}

function DaySectionDesktop({ day, today }) {
  const isPast = day.date < today;
  const isToday = day.date === today;
  const hasAnyPlanned = day.slots.some(slot => slot.status !== 'off' && slot.status !== 'unplanned');

  return (
    <section className={`rounded-2xl border border-[#243b56] bg-[#0c1724]/80 p-4 md:p-5 space-y-4 ${isPast ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full ${isToday ? 'bg-primary' : hasAnyPlanned ? 'bg-[#4d6074]' : 'bg-[#2c4259]'}`} />
        <div className="text-sm font-bold uppercase tracking-widest text-[#c6d4e2]">
          {formatDateShort(day.date).toUpperCase()}{isToday ? ' · Today' : ''}
        </div>
        <div className="h-px flex-1 bg-[#1f3249]" />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {day.slots.map(slot => (
          <MealCard key={`${day.date}-${slot.type}`} dayDate={day.date} slot={slot} isPast={isPast} compact />
        ))}
      </div>
    </section>
  );
}

function DaySkeletonMobile() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-3 w-28 bg-[#1f3249] rounded" />
      <div className="h-24 bg-[#0c1724] rounded-xl" />
      <div className="h-24 bg-[#0c1724] rounded-xl" />
    </div>
  );
}

function DaySkeletonDesktop() {
  return (
    <div className="animate-pulse rounded-2xl border border-[#243b56] bg-[#0c1724]/50 p-5 space-y-4">
      <div className="h-4 w-40 bg-[#1f3249] rounded" />
      <div className="grid md:grid-cols-2 gap-3">
        <div className="h-28 bg-[#1f3249] rounded-xl" />
        <div className="h-28 bg-[#1f3249] rounded-xl" />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="h-16 md:h-20 border-b border-[#243b56] px-4 md:px-6 lg:px-8 flex items-center bg-[#22364f]/95 backdrop-blur-md sticky top-0 z-20">
      <div>
        <h1 className="text-2xl md:text-4xl font-semibold tracking-tight">Meal Plan</h1>
        <p className="text-xs md:text-sm text-[#8ea3bb]">Review and add to freeze</p>
      </div>
    </header>
  );
}

function ControlsAndSummary({
  dayOptions,
  days,
  setDays,
  loading,
  summary,
  coveragePct,
  nextUncoveredLabel,
  nextUncoveredNote,
  nextEmptyLabel,
  nextEmptyNote,
}) {
  return (
    <section className="rounded-xl md:rounded-2xl bg-[#0c1724] border border-[#243b56] p-4 md:p-5 lg:p-6 space-y-4 md:space-y-5">
      <div className="flex gap-1 p-1 bg-[#09121d] rounded-lg md:max-w-sm">
        {dayOptions.map(option => (
          <button
            key={option}
            onClick={() => setDays(option)}
            className={`flex-1 h-8 md:h-9 rounded-md text-sm font-medium transition-colors ${
              days === option
                ? 'bg-[#1f3249] text-white'
                : 'text-[#8ea3bb] hover:text-[#dce7f3]'
            }`}
          >
            {option} days
          </button>
        ))}
      </div>

      <div className="space-y-4 md:space-y-5">
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8ea3bb]">Coverage</div>
            {loading ? (
              <div className="h-7 w-40 mt-1 bg-[#1f3249] rounded animate-pulse" />
            ) : (
              <h2 className="text-xl md:text-2xl font-semibold">{summary.covered} of {summary.total} meals</h2>
            )}
            <p className="text-xs md:text-sm text-[#8ea3bb] mt-1">Covered means this meal already exists in freezer stock.</p>
          </div>

          <div className="space-y-1.5">
            <div className="text-sm md:text-base font-semibold text-[#dce7f3]">{coveragePct}% covered</div>
            <div className="w-full h-2 rounded-full bg-[#1f3249] overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${coveragePct}%` }} />
            </div>
          </div>
        </div>

        {!loading && (
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <article className="rounded-lg bg-[#1f3249] border border-[#243b56] p-2.5 md:p-3 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8ea3bb]">Next uncovered day</div>
              <div className="text-sm font-semibold mt-1 truncate">{nextUncoveredLabel}</div>
              <div className="text-xs text-[#8ea3bb] mt-0.5">{nextUncoveredNote}</div>
            </article>
            <article className="rounded-lg bg-[#1f3249] border border-[#243b56] p-2.5 md:p-3 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8ea3bb]">Next empty day</div>
              <div className="text-sm font-semibold mt-1 truncate">{nextEmptyLabel}</div>
              <div className="text-xs text-[#8ea3bb] mt-0.5">{nextEmptyNote}</div>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}

function ErrorBlock({ error }) {
  const navigate = useNavigate();

  return (
    <div className="p-4 rounded-xl bg-[#0c1724] border border-[#243b56] text-center">
      <p className="text-[#c6d4e2] text-sm mb-2">Could not load meal plan.</p>
      {error.toLowerCase().includes('configured') ? (
        <p className="text-xs text-[#8ea3bb]">
          Connect Mealie in{' '}
          <button onClick={() => navigate('/settings')} className="text-primary underline">
            Settings
          </button>
        </p>
      ) : (
        <p className="text-xs text-[#8ea3bb]">{error}</p>
      )}
    </div>
  );
}

export default function Plan() {
  const [days, setDays] = useState(7);
  const { data, loading, error } = useMealiePlan(days);
  const dayOptions = [7, 14, 30];
  const today = localDateStr();

  const summary = data?.summary ?? { total: 0, covered: 0, partial: 0, missing: 0 };
  const coveragePct = summary.total > 0 ? Math.round((summary.covered / summary.total) * 100) : 0;

  const meta = useMemo(() => {
    const daysList = data?.days || [];
    const upcoming = daysList.filter(d => d.date >= today);

    const nextUncovered = upcoming.find(day =>
      day.slots.some(slot => ['missing', 'partial', 'low', 'unplanned'].includes(slot.status))
    );

    const nextEmpty = upcoming.find(day => {
      const enabled = day.slots.filter(slot => slot.status !== 'off');
      return enabled.length > 0 && enabled.every(slot => slot.status === 'unplanned');
    });

    return {
      nextUncoveredLabel: nextUncovered ? formatDateShort(nextUncovered.date).toUpperCase() : 'All covered',
      nextUncoveredNote: nextUncovered ? 'A meal still needs freezer coverage.' : 'No uncovered days in this range.',
      nextEmptyLabel: nextEmpty ? formatDateShort(nextEmpty.date).toUpperCase() : 'None',
      nextEmptyNote: nextEmpty ? 'No lunch/dinner planned yet.' : 'Every day has at least one meal planned.',
    };
  }, [data?.days, today]);

  return (
    <div className="flex flex-col min-h-full pb-24 md:pb-8">
      <Header />

      <main className="flex-1 px-4 md:px-6 lg:px-8 pt-4 md:pt-6 pb-8 space-y-5 md:space-y-6 max-w-7xl w-full mx-auto">
        <ControlsAndSummary
          dayOptions={dayOptions}
          days={days}
          setDays={setDays}
          loading={loading}
          summary={summary}
          coveragePct={coveragePct}
          nextUncoveredLabel={meta.nextUncoveredLabel}
          nextUncoveredNote={meta.nextUncoveredNote}
          nextEmptyLabel={meta.nextEmptyLabel}
          nextEmptyNote={meta.nextEmptyNote}
        />

        {error && <ErrorBlock error={error} />}

        {loading && !error && (
          <>
            <div className="space-y-5 md:hidden">
              <DaySkeletonMobile />
              <DaySkeletonMobile />
              <DaySkeletonMobile />
            </div>
            <div className="hidden md:block space-y-4">
              <DaySkeletonDesktop />
              <DaySkeletonDesktop />
            </div>
          </>
        )}

        {!loading && !error && data && (
          <>
            <div className="space-y-5 md:hidden">
              {data.days.map(day => (
                <DaySectionMobile key={day.date} day={day} today={today} />
              ))}
            </div>
            <div className="hidden md:grid md:grid-cols-1 gap-4 lg:gap-5">
              {data.days.map(day => (
                <DaySectionDesktop key={day.date} day={day} today={today} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
