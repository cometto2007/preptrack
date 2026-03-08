import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, ChevronDown, ChevronUp, Snowflake } from 'lucide-react';
import { mealsApi } from '../services/api';
import { useMeals } from '../hooks/useMeals';
import { useSettings } from '../hooks/useSettings';
import { localDateStr } from '../utils/dates';
import { EXPIRY_DAYS, buildExpiryMap, calcExpiry } from '../utils/expiry';

const CATEGORIES = Object.keys(EXPIRY_DAYS);

export default function AddItem() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const { meals } = useMeals();
  const rawSettings = useSettings();
  const expiryDays = useMemo(() => buildExpiryMap(rawSettings), [rawSettings]);

  const [name, setName] = useState(location.state?.name ?? '');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [portions, setPortions] = useState(2);
  const [category, setCategory] = useState('Meals');
  const [freezeDate, setFreezeDate] = useState(localDateStr());
  const [expiryDate, setExpiryDate] = useState(calcExpiry('Meals', localDateStr()));
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [prefilling, setPrefilling] = useState(Boolean(editId));
  const [error, setError] = useState(null);
  const nameRef = useRef(null);

  // Pre-fill when editing
  useEffect(() => {
    if (!editId) return;
    setPrefilling(true);
    mealsApi.get(editId).then(({ meal }) => {
      setName(meal.name);
      setCategory(meal.category);
      setNotes(meal.notes || '');
      if (meal.notes) setShowNotes(true);
    }).catch(() => {}).finally(() => setPrefilling(false));
  }, [editId]);

  // Recalculate expiry whenever category, freeze date, or live settings change
  useEffect(() => {
    setExpiryDate(calcExpiry(category, freezeDate, expiryDays));
  }, [category, freezeDate, expiryDays]);

  // Autocomplete from existing meal names
  useEffect(() => {
    if (!name.trim()) { setSuggestions([]); return; }
    const q = name.toLowerCase();
    const matches = meals
      .filter(m => m.name.toLowerCase().includes(q) && m.name.toLowerCase() !== q)
      .slice(0, 5);
    setSuggestions(matches);
  }, [name, meals]);

  function selectSuggestion(meal) {
    setName(meal.name);
    setCategory(meal.category);
    if (meal.notes) { setNotes(meal.notes); setShowNotes(true); }
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Meal name is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      if (editId) {
        await mealsApi.update(editId, { name: trimmedName, category, notes: notes || null });
      } else {
        // Find existing meal by exact name (case-insensitive)
        const existing = meals.find(m => m.name.toLowerCase() === trimmedName.toLowerCase());
        const mealId = existing
          ? existing.id
          : (await mealsApi.create({ name: trimmedName, category, notes: notes || null })).meal.id;

        await mealsApi.increment(mealId, {
          portions,
          freeze_date: freezeDate,
          expiry_date: expiryDate,
        });
      }
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const isEdit = Boolean(editId);

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-bg-app/80 backdrop-blur-md px-4 py-3 flex items-center gap-3 border-b border-slate-800">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-slate-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">{isEdit ? 'Edit Meal' : 'Add to Freezer'}</h1>
      </header>

      {prefilling && (
        <div className="flex-1 p-4 space-y-4 animate-pulse">
          <div className="h-12 bg-slate-800 rounded-xl" />
          <div className="h-12 bg-slate-800 rounded-xl" />
          <div className="h-10 bg-slate-800 rounded-xl w-2/3" />
        </div>
      )}

      <form onSubmit={handleSubmit} className={`flex-1 flex flex-col ${prefilling ? 'hidden' : ''}`}>
        <div className="flex flex-col gap-6 p-4 pb-28">
          {/* Meal name */}
          <section className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Meal Name</label>
            <div className="relative">
              <div className="flex w-full items-stretch rounded-xl bg-slate-800/50 border border-slate-700 focus-within:border-primary transition-colors">
                <input
                  ref={nameRef}
                  value={name}
                  onChange={e => { setName(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="e.g. Beef Bolognese"
                  maxLength={100}
                  className="w-full bg-transparent border-none focus:ring-0 p-4 text-base font-medium placeholder:text-slate-500 outline-none"
                  required
                />
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-bg-surface border border-slate-700 rounded-xl overflow-hidden z-10 shadow-xl">
                  {suggestions.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={() => selectSuggestion(m)}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 flex items-center justify-between"
                    >
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-slate-400">{m.category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Portions — hidden for edit mode */}
          {!isEdit && (
            <section className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary">
                  <Snowflake size={18} />
                </div>
                <span className="text-base font-semibold">Portions</span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setPortions(p => Math.max(1, p - 1))}
                  className="size-12 rounded-full bg-slate-700 flex items-center justify-center hover:bg-slate-600 transition-colors"
                >
                  <Minus size={18} />
                </button>
                <span className="text-xl font-bold w-6 text-center">{portions}</span>
                <button
                  type="button"
                  onClick={() => setPortions(p => p + 1)}
                  className="size-12 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors"
                >
                  <Plus size={18} />
                </button>
              </div>
            </section>
          )}

          {/* Category */}
          <section className="flex flex-col gap-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Category</label>
            <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4 pb-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    category === cat
                      ? 'bg-primary text-white'
                      : 'bg-slate-800 border border-slate-700 text-slate-300 hover:border-primary/50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </section>

          {/* Dates — hidden for edit mode */}
          {!isEdit && (
            <section className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Freeze Date</label>
                <input
                  type="date"
                  value={freezeDate}
                  onChange={e => setFreezeDate(e.target.value)}
                  className="p-3 rounded-xl bg-slate-800/50 border border-slate-700 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Expiry Date</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="p-3 rounded-xl bg-slate-800/50 border border-slate-700 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </section>
          )}

          {/* Notes */}
          <section className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowNotes(v => !v)}
              className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span>Notes</span>
              {showNotes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showNotes && (
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Storage instructions, ingredients, or other notes..."
                rows={3}
                maxLength={1000}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm focus:outline-none focus:border-primary placeholder:text-slate-500 resize-none"
              />
            )}
          </section>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Sticky submit */}
        <div className="fixed bottom-0 left-0 right-0 md:left-64 p-4 bg-bg-app/90 backdrop-blur-xl border-t border-slate-800 z-20 safe-bottom">
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          >
            <Snowflake size={18} />
            {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Add to Freezer'}
          </button>
        </div>
      </form>
    </div>
  );
}
