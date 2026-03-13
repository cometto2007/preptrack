import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Plus, RefreshCw } from 'lucide-react';
import { useMeals } from '../hooks/useMeals';
import { mealsApi, notificationsApi, categoriesApi } from '../services/api';
import MealCard from '../components/shared/MealCard';
import QuickCounter from '../components/shared/QuickCounter';
import AddToFreezerSheet from '../components/shared/AddToFreezerSheet';
import { getExpiryInfo } from '../components/shared/StatusBadge';
import LunchPrompt from '../components/prompts/LunchPrompt';
import DinnerPrompt from '../components/prompts/DinnerPrompt';

function SkeletonCard() {
  return (
    <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex items-center gap-3 animate-pulse">
      <div className="size-16 rounded-xl bg-slate-800 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-slate-800 rounded w-3/4" />
        <div className="h-2 bg-slate-800 rounded w-1/2" />
      </div>
      <div className="w-10 h-12 bg-slate-800 rounded-lg flex-shrink-0" />
    </div>
  );
}

export default function Dashboard() {
  const { meals, loading, error, reload } = useMeals();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [counterMeal, setCounterMeal] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPrefill, setSheetPrefill] = useState('');

  function openSheet(name = '') { setSheetPrefill(name); setSheetOpen(true); }
  function handleSheetClose() { setSheetOpen(false); setSheetPrefill(''); reload(); }
  const [prompts, setPrompts] = useState([]);
  const [categories, setCategories] = useState([]);

  const loadPrompts = useCallback(async () => {
    try {
      const { prompts: p } = await notificationsApi.getPending();
      setPrompts(p || []);
    } catch {
      // non-fatal — prompts just don't show
    }
  }, []);

  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  const loadCategories = useCallback(async () => {
    try {
      const { categories: rows } = await categoriesApi.list();
      setCategories(rows || []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories, meals]);

  const stats = useMemo(() => {
    const total = meals.reduce((s, m) => s + m.total_portions, 0);
    // "Expiring Soon" = amber only (0–14 days). "Expired" = red. Both require portions > 0.
    const expiringSoon = meals.filter(m => {
      if (!m.earliest_expiry || m.total_portions === 0) return false;
      return getExpiryInfo(m.earliest_expiry)?.color === 'amber';
    }).length;
    const expired = meals.filter(m => {
      if (!m.earliest_expiry || m.total_portions === 0) return false;
      return getExpiryInfo(m.earliest_expiry)?.color === 'red';
    }).length;
    return { total, expiringSoon, expired };
  }, [meals]);

  const filtered = useMemo(() => {
    let list = meals;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q));
    }
    // "Expiring Soon" filter matches the stat: amber items only (0–14 days, > 0 portions)
    if (activeFilter === 'Expiring Soon') {
      list = list.filter(m => {
        if (!m.earliest_expiry || m.total_portions === 0) return false;
        return getExpiryInfo(m.earliest_expiry)?.color === 'amber';
      });
    } else if (activeFilter !== 'All') {
      if (activeFilter === 'Uncategorised') {
        list = list.filter(m => !m.mealie_category_name);
      } else {
        list = list.filter(m => m.mealie_category_name === activeFilter);
      }
    }
    return list;
  }, [meals, search, activeFilter]);

  const filterChips = useMemo(() => {
    const total = categories.reduce((sum, c) => sum + Number(c.count || 0), 0);
    const fromApi = categories
      .filter(c => c.name !== 'Uncategorised' || Number(c.count || 0) > 0)
      .map(c => ({ label: c.name, count: Number(c.count || 0) }));
    return [{ label: 'All', count: total }, { label: 'Expiring Soon', count: stats.expiringSoon }, ...fromApi];
  }, [categories, stats.expiringSoon]);

  useEffect(() => {
    if (filterChips.some(c => c.label === activeFilter)) return;
    setActiveFilter('All');
  }, [filterChips, activeFilter]);

  async function handleRemove(count) {
    if (!counterMeal) return;
    setActionError(null);
    try {
      await mealsApi.decrement(counterMeal.id, { quantity: count, source: 'manual' });
      await reload();
      setCounterMeal(null);
    } catch (e) {
      setActionError(e.message);
      // Keep the sheet open so the user sees the error and can retry or cancel
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-bg-app/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            P
          </div>
          <h1 className="text-xl font-bold tracking-tight">PrepTrack</h1>
        </div>
      </header>

      {/* Fetch error banner */}
      {error && !loading && (
        <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between gap-3">
          <p className="text-red-400 text-sm">Failed to load inventory: {error}</p>
          <button onClick={reload} className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0">
            <RefreshCw size={16} />
          </button>
        </div>
      )}

      <main className="flex-1 pb-4">
        {/* Stats strip */}
        <section className="px-4 pt-4 mb-4">
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
            <StatCard label="Total" value={stats.total} sub="portions" />
            <StatCard label="Expiring" value={stats.expiringSoon} sub="soon" valueClass="text-amber-400" />
            <StatCard label="Expired" value={stats.expired} sub="items" valueClass={stats.expired > 0 ? 'text-red-400' : ''} />
          </div>
        </section>

        {/* Daily planning prompts */}
        {prompts.length > 0 && (
          <section className="px-4 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold tracking-tight">Daily Planning</h3>
              <span className="text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full uppercase tracking-wider">
                {prompts.length} Task{prompts.length !== 1 ? 's' : ''}
              </span>
            </div>
            {prompts.map(prompt =>
              prompt.meal_type === 'lunch'
                ? <LunchPrompt key={`${prompt.date}:${prompt.meal_type}`} prompt={prompt} onResolved={() => { loadPrompts(); reload(); }} />
                : <DinnerPrompt key={`${prompt.date}:${prompt.meal_type}`} prompt={prompt} onResolved={() => { loadPrompts(); reload(); }} />
            )}
          </section>
        )}

        {/* Search + filters */}
        <section className="px-4 space-y-3 mb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search freezer inventory"
              className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Search freezer inventory..."
            />
          </div>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {filterChips.map(f => (
              <button
                key={f.label}
                onClick={() => setActiveFilter(f.label)}
                aria-pressed={activeFilter === f.label}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeFilter === f.label
                    ? 'bg-primary text-white'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {`${f.label} (${f.count})`}
              </button>
            ))}
          </div>
        </section>

        {/* Meal list */}
        <section className="px-4 space-y-3">
          {loading ? (
            <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
          ) : filtered.length === 0 ? (
            <EmptyState search={search} filter={activeFilter} onAdd={openSheet} />
          ) : (
            filtered.map(meal => (
              <MealCard
                key={meal.id}
                meal={meal}
                onMinus={m => { setActionError(null); setCounterMeal(m); }}
              />
            ))
          )}
        </section>
      </main>

      {/* FAB */}
      <button
        onClick={() => openSheet()}
        className="fixed bottom-20 right-4 md:bottom-6 z-30 size-14 bg-primary text-white rounded-full shadow-lg shadow-primary/40 flex items-center justify-center active:scale-90 transition-transform"
      >
        <Plus size={28} />
      </button>

      {/* Quick counter sheet */}
      {counterMeal && (
        <QuickCounter
          meal={counterMeal}
          mode="remove"
          initialCount={1}
          maxCount={counterMeal.total_portions}
          onConfirm={handleRemove}
          onClose={() => { setCounterMeal(null); setActionError(null); }}
        />
      )}

      {/* Action error toast (shown below the sheet) */}
      {actionError && (
        <div className="fixed bottom-4 left-4 right-4 z-[60] p-3 bg-red-500/90 rounded-xl text-white text-sm text-center">
          {actionError}
        </div>
      )}

      {/* Add to Freezer sheet */}
      <AddToFreezerSheet
        isOpen={sheetOpen}
        onClose={handleSheetClose}
        prefillName={sheetPrefill}
      />
    </div>
  );
}

function StatCard({ label, value, sub, valueClass = '' }) {
  return (
    <div className="flex-shrink-0 min-w-[90px] bg-slate-900 p-3 rounded-xl border border-slate-800">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{label}</p>
      <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-slate-500 font-medium">{sub}</p>
    </div>
  );
}

function EmptyState({ search, filter, onAdd }) {
  const isFiltered = search || filter !== 'All';
  const hasSearch = Boolean(search.trim());
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl">🧊</div>
      <div>
        <h2 className="text-lg font-semibold mb-1">
          {isFiltered ? 'No matches found' : 'Freezer is empty'}
        </h2>
        <p className="text-slate-400 text-sm">
          {isFiltered ? 'Try a different search or filter' : 'Add your first frozen meal to get started'}
        </p>
      </div>
      {!isFiltered && (
        <button onClick={() => onAdd()} className="px-6 py-3 bg-primary text-white rounded-xl font-semibold text-sm">
          Add First Meal
        </button>
      )}
      {hasSearch && (
        <button onClick={() => onAdd(search.trim())} className="px-6 py-3 bg-primary text-white rounded-xl font-semibold text-sm">
          Add &ldquo;{search.trim()}&rdquo; to freezer
        </button>
      )}
    </div>
  );
}
