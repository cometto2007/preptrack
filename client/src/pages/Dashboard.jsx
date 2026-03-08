import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, RefreshCw } from 'lucide-react';
import { useMeals } from '../hooks/useMeals';
import { mealsApi } from '../services/api';
import MealCard from '../components/shared/MealCard';
import QuickCounter from '../components/shared/QuickCounter';
import { getExpiryInfo } from '../components/shared/StatusBadge';

const FILTERS = ['All', 'Expiring Soon', 'Meals', 'Soups', 'Sauces', 'Baked Goods', 'Ingredients', 'Other'];

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
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [counterMeal, setCounterMeal] = useState(null);
  const [actionError, setActionError] = useState(null);

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
      list = list.filter(m => m.category === activeFilter);
    }
    return list;
  }, [meals, search, activeFilter]);

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
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                aria-pressed={activeFilter === f}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeFilter === f
                    ? 'bg-primary text-white'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </section>

        {/* Meal list */}
        <section className="px-4 space-y-3">
          {loading ? (
            <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
          ) : filtered.length === 0 ? (
            <EmptyState search={search} filter={activeFilter} onAdd={() => navigate('/add', search.trim() ? { state: { name: search.trim() } } : undefined)} />
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
        onClick={() => navigate('/add')}
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
        <button onClick={onAdd} className="px-6 py-3 bg-primary text-white rounded-xl font-semibold text-sm">
          Add First Meal
        </button>
      )}
      {hasSearch && (
        <button onClick={onAdd} className="px-6 py-3 bg-primary text-white rounded-xl font-semibold text-sm">
          Add &ldquo;{search.trim()}&rdquo; to freezer
        </button>
      )}
    </div>
  );
}
