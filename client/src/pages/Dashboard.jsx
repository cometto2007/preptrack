import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Plus, RefreshCw, Package2, Utensils, Clock, AlertCircle } from 'lucide-react';
import { useMeals } from '../hooks/useMeals';
import { useSettings } from '../hooks/useSettings';
import PageHeader from '../components/layout/PageHeader';
import { mealsApi, notificationsApi, categoriesApi } from '../services/api';
import MealCard from '../components/shared/MealCard';
import QuickCounter from '../components/shared/QuickCounter';
import AddToFreezerSheet from '../components/shared/AddToFreezerSheet';
import { getExpiryInfo } from '../components/shared/StatusBadge';
import LunchPrompt from '../components/prompts/LunchPrompt';
import DinnerPrompt from '../components/prompts/DinnerPrompt';

function SkeletonCard() {
  return (
    <div className="bg-slate-800/50 border border-slate-700/10 rounded-xl overflow-hidden animate-pulse
      flex gap-4 items-center p-4 md:flex-col md:items-stretch md:gap-0 md:p-0">
      <div className="w-20 h-20 flex-shrink-0 rounded-lg bg-slate-700/50 md:w-full md:h-40 md:rounded-none" />
      <div className="flex-1 space-y-2 md:p-4">
        <div className="h-3 bg-slate-700/50 rounded w-3/4" />
        <div className="h-2 bg-slate-700/50 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { meals, loading, error, reload } = useMeals();
  const settings = useSettings();
  const mealieUrl = settings?.mealie_url?.replace(/\/$/, '') || '';
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
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
      // non-fatal
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

  useEffect(() => { loadCategories(); }, [loadCategories, meals]);

  const stats = useMemo(() => {
    const total = meals.reduce((s, m) => s + m.total_portions, 0);
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

  async function handleDirectDecrement(meal) {
    try {
      await mealsApi.decrement(meal.id, { quantity: 1, source: 'manual' });
      await reload();
    } catch (e) {
      setActionError(e.message);
    }
  }

  async function handleRemove(count) {
    if (!counterMeal) return;
    setActionError(null);
    try {
      await mealsApi.decrement(counterMeal.id, { quantity: count, source: 'manual' });
      await reload();
      setCounterMeal(null);
    } catch (e) {
      setActionError(e.message);
    }
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* Page header — all viewports */}
      <PageHeader
        title="Dashboard"
        subtitle="Your freezer at a glance"
        sticky
        actions={
          <>
            {/* Mobile: search icon toggle */}
            <button
              onClick={() => setSearchOpen(s => !s)}
              aria-label="Toggle search"
              className="md:hidden w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <Search size={18} />
            </button>
            {/* Desktop/tablet: inline search input */}
            <div className="relative w-72 hidden md:block">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search meals"
                className="w-full pl-11 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/10 rounded-full text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary/50"
                placeholder="Search meals..."
              />
            </div>
          </>
        }
      />

      {/* Mobile collapsible search bar */}
      {searchOpen && (
        <div className="md:hidden px-4 pb-3 bg-[#22364f]/95 border-b border-slate-700/10">
          <div className="relative">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search meals"
              autoFocus
              className="w-full pl-11 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/10 rounded-full text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary/50"
              placeholder="Search meals..."
            />
          </div>
        </div>
      )}

      {/* Fetch error banner */}
      {error && !loading && (
        <div className="mx-4 md:mx-0 mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between gap-3">
          <p className="text-red-400 text-sm">Failed to load inventory: {error}</p>
          <button onClick={reload} className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0">
            <RefreshCw size={16} />
          </button>
        </div>
      )}

      <main className="flex-1 pb-32 md:pb-6">

        {/* Daily planning prompts */}
        {prompts.length > 0 && (
          <section className="px-4 md:px-0 mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold tracking-tight">Daily Planning</h3>
              <span className="text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full uppercase tracking-wider">
                {prompts.length} Task{prompts.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {prompts.map(prompt =>
                prompt.meal_type === 'lunch'
                  ? <LunchPrompt key={`${prompt.date}:${prompt.meal_type}`} prompt={prompt} onResolved={() => { loadPrompts(); reload(); }} />
                  : <DinnerPrompt key={`${prompt.date}:${prompt.meal_type}`} prompt={prompt} onResolved={() => { loadPrompts(); reload(); }} />
              )}
            </div>
          </section>
        )}

        {/* Stats — 2×2 mobile, 4-col desktop */}
        <section className="px-4 md:px-0 mb-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatCard
              label="Total Items"
              value={meals.length}
              Icon={Package2}
              iconBgClass="bg-teal-400/10"
              iconClass="text-teal-400"
            />
            <StatCard
              label="Total Portions"
              value={stats.total}
              Icon={Utensils}
              iconBgClass="bg-blue-500/10"
              iconClass="text-blue-400"
            />
            <StatCard
              label="Expiring Soon"
              value={stats.expiringSoon}
              valueClass="text-amber-400"
              Icon={Clock}
              iconBgClass="bg-amber-500/10"
              iconClass="text-amber-400"
            />
            <StatCard
              label="Expired"
              value={stats.expired}
              valueClass={stats.expired > 0 ? 'text-red-400' : ''}
              Icon={AlertCircle}
              iconBgClass="bg-red-500/10"
              iconClass="text-red-400"
            />
          </div>
        </section>

        {/* Filter chips */}
        <section className="px-4 md:px-0 mb-5">
          <div className="flex gap-2 overflow-x-auto hide-scrollbar flex-nowrap md:flex-wrap">
            {filterChips.map(f => (
              <button
                key={f.label}
                onClick={() => setActiveFilter(f.label)}
                aria-pressed={activeFilter === f.label}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeFilter === f.label
                    ? 'bg-primary text-white'
                    : 'bg-slate-800/30 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {`${f.label} (${f.count})`}
              </button>
            ))}
          </div>
        </section>

        {/* Inventory */}
        <section className="px-4 md:px-0">
          {loading ? (
            <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4 lg:gap-5">
              <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState search={search} filter={activeFilter} onAdd={openSheet} />
          ) : (
            <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4 lg:gap-5">
              {filtered.map(meal => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  mealieUrl={mealieUrl}
                  onDecrement={m => { setActionError(null); handleDirectDecrement(m); }}
                  onIncrement={m => openSheet(m.name)}
                  onCounterTap={m => { setActionError(null); setCounterMeal(m); }}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* FAB */}
      <button
        onClick={() => openSheet()}
        className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-30 w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center active:scale-90 transition-transform"
      >
        <Plus size={26} />
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

      {/* Action error toast */}
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

function StatCard({ label, value, valueClass = '', Icon, iconBgClass, iconClass }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/10 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-xs mb-1">{label}</p>
          <p className={`text-2xl font-bold ${valueClass || 'text-slate-100'}`}>{value}</p>
        </div>
        <div className={`w-10 h-10 ${iconBgClass} rounded-lg flex items-center justify-center flex-shrink-0`}>
          <Icon size={20} className={iconClass} />
        </div>
      </div>
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
