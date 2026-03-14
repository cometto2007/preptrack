import { useState, useEffect, useRef } from 'react';
import { mealsApi, mealieApi } from '../../services/api';
import { useSettings } from '../../hooks/useSettings';
import { localDateStr } from '../../utils/dates';
import { buildExpiryMap } from '../../utils/expiry';

const SHELF_PILLS = [1, 2, 3, 6];
const MONTHS_TO_DAYS = { 1: 30, 2: 60, 3: 90, 6: 180 };

function daysToNearestMonths(days) {
  const options = [30, 60, 90, 180];
  const months  = [1,  2,  3,  6];
  const idx = options.reduce((best, curr, i) =>
    Math.abs(curr - days) < Math.abs(options[best] - days) ? i : best, 0);
  return months[idx];
}

function addMonthsToDate(dateStr, months) {
  const days = MONTHS_TO_DAYS[months] || 90;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export default function AddToFreezerSheet({ isOpen, onClose, prefillName, prefillRecipeSlug }) {
  const settings   = useSettings();
  const expiryDays = buildExpiryMap(settings);
  const TODAY      = localDateStr();

  // Core form state
  const [name,          setName]          = useState('');
  const [portions,      setPortions]      = useState(2);
  const [shelfMonths,   setShelfMonths]   = useState(3);
  const [isCustomExpiry,setIsCustomExpiry]= useState(false);
  const [freezeDate,    setFreezeDate]    = useState(TODAY);
  const [expiryDate,    setExpiryDate]    = useState('');
  const [notes,         setNotes]         = useState('');
  const [showNotes,     setShowNotes]     = useState(false);
  const [category,      setCategory]      = useState('');
  const [mealieSlug,    setMealieSlug]    = useState('');
  const [mealieImageId, setMealieImageId] = useState(null);

  // Autocomplete
  const [existingMeals,        setExistingMeals]        = useState([]);
  const [mealieRecipeSuggestions, setMealieRecipeSuggestions] = useState([]);
  const [showSuggestions,      setShowSuggestions]      = useState(false);

  // Submission / feedback
  const [submitting, setSubmitting] = useState(false);
  const [toast,      setToast]      = useState(false);

  const inputRef       = useRef(null);
  const mealieDebounce = useRef(null);
  const toastTimer     = useRef(null);

  // Cancel toast timer on unmount
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Sync shelf months from settings on load
  useEffect(() => {
    setShelfMonths(daysToNearestMonths(expiryDays));
  }, [expiryDays]);

  // Recompute expiry whenever freeze date or shelf months change (unless custom)
  useEffect(() => {
    if (!isCustomExpiry) {
      setExpiryDate(addMonthsToDate(freezeDate, shelfMonths));
    }
  }, [freezeDate, shelfMonths, isCustomExpiry]);

  // On open: load existing meals, apply prefills, focus input
  useEffect(() => {
    if (!isOpen) return;
    mealsApi.list(null, { includeEmpty: true })
      .then(({ meals }) => setExistingMeals(meals))
      .catch(() => {});
    if (prefillName)       setName(prefillName);
    if (prefillRecipeSlug) setMealieSlug(prefillRecipeSlug);
    if (!prefillName) setTimeout(() => inputRef.current?.focus(), 350);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mealie search on name change
  useEffect(() => {
    if (!name.trim() || name.trim().length < 2) {
      setMealieRecipeSuggestions([]);
      return;
    }
    clearTimeout(mealieDebounce.current);
    mealieDebounce.current = setTimeout(() => {
      mealieApi.searchRecipes(name)
        .then(({ recipes }) => {
          setMealieRecipeSuggestions((recipes || []).slice(0, 5));
        })
        .catch(() => setMealieRecipeSuggestions([]));
    }, 300);
  }, [name, existingMeals]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') handleClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // intentionally no deps — always fresh closure

  // ── Helpers ────────────────────────────────────────────────────────────────

  function reset() {
    const months = daysToNearestMonths(expiryDays);
    setName(''); setPortions(2); setShelfMonths(months);
    setIsCustomExpiry(false); setFreezeDate(TODAY);
    setExpiryDate(addMonthsToDate(TODAY, months));
    setNotes(''); setShowNotes(false);
    setCategory(''); setMealieSlug(''); setMealieImageId(null);
    setMealieRecipeSuggestions([]); setShowSuggestions(false);
  }

  function handleClose() { reset(); onClose(); }

  function setShelf(months) { setShelfMonths(months); setIsCustomExpiry(false); }

  function handleNameChange(val) {
    setName(val);
    setShowSuggestions(true);
    if (!val) { setCategory(''); setMealieSlug(''); }
  }

  function selectLocalMeal(meal) {
    setName(meal.name);
    setMealieSlug(meal.mealie_recipe_slug || '');
    setCategory(meal.mealie_category_name || '');
    setShowSuggestions(false);
  }

  function selectMealieRecipe(recipe) {
    setName(recipe.name);
    setMealieSlug(recipe.slug);
    setCategory(recipe.recipeCategory?.[0]?.name || recipe.mealie_category_name || '');
    if (recipe.imageId) setMealieImageId(recipe.imageId);
    if (recipe.recipeServings) setPortions(Math.max(1, Math.round(Number(recipe.recipeServings) || 2)));
    setShowSuggestions(false);
    setMealieRecipeSuggestions([]);
  }

  async function handleSubmit() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const existing = existingMeals.find(
        m => m.name.toLowerCase() === name.trim().toLowerCase()
      );
      let mealId;
      if (existing) {
        mealId = existing.id;
        const imageUrl = mealieImageId ? `/api/mealie/recipe-image/${mealieImageId}` : null;
        const needsUpdate =
          (mealieSlug && !existing.mealie_recipe_slug) ||
          (category && !existing.mealie_category_name) ||
          (imageUrl && !existing.image_url);
        if (needsUpdate) {
          await mealsApi.update(existing.id, {
            ...(mealieSlug && !existing.mealie_recipe_slug ? { mealie_recipe_slug: mealieSlug } : {}),
            ...(category && !existing.mealie_category_name ? { mealie_category_name: category } : {}),
            ...(imageUrl && !existing.image_url ? { image_url: imageUrl } : {}),
          });
        }
      } else {
        const { meal } = await mealsApi.create({
          name: name.trim(),
          notes: notes || null,
          mealie_recipe_slug: mealieSlug || undefined,
          ...(mealieImageId ? { image_url: `/api/mealie/recipe-image/${mealieImageId}` } : {}),
        });
        mealId = meal.id;
      }
      await mealsApi.increment(mealId, {
        portions,
        freeze_date: freezeDate,
        expiry_date: expiryDate,
      });
      setToast(true);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(false), 2000);
      handleClose();
    } catch (err) {
      console.error('AddToFreezerSheet submit error:', err);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const localSuggestions = existingMeals
    .filter(m => m.name.toLowerCase().includes(name.toLowerCase()) && m.name.toLowerCase() !== name.toLowerCase())
    .slice(0, 5);

  const allSuggestions = [
    ...localSuggestions.map(m => ({ ...m, _type: 'local' })),
    ...mealieRecipeSuggestions.map(r => ({ ...r, _type: 'mealie' })),
  ];

  const canSubmit     = name.trim() && !submitting;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.5)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s',
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          maxWidth: 480, margin: '0 auto',
          background: '#1a2332',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          zIndex: 100,
          maxHeight: '85vh', overflowY: 'auto',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Handle bar */}
        <div style={{ width: 36, height: 4, background: 'rgba(148,163,184,0.25)', borderRadius: 2, margin: '12px auto 0' }} />

        {/* Header */}
        <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>Add to freezer</span>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer', padding: 8, borderRadius: 8, fontFamily: 'inherit' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(148,163,184,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            Cancel
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Meal name + autocomplete ── */}
          <div style={{ position: 'relative' }}>
            <div style={s.label}>Meal</div>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              onFocus={e => {
                setShowSuggestions(true);
                e.target.style.borderColor = 'rgba(43,140,238,0.5)';
                e.target.style.boxShadow   = '0 0 0 3px rgba(43,140,238,0.1)';
              }}
              onBlur={e => {
                setTimeout(() => setShowSuggestions(false), 150);
                e.target.style.borderColor = 'rgba(148,163,184,0.15)';
                e.target.style.boxShadow   = 'none';
              }}
              placeholder="Search recipes..."
              autoComplete="off"
              style={s.input}
            />
            {category && (
              <div style={{ display: 'inline-flex', fontSize: 12, color: '#94a3b8', background: 'rgba(148,163,184,0.08)', padding: '4px 12px', borderRadius: 20, marginTop: 10 }}>
                {category}
              </div>
            )}

            {/* Dropdown */}
            {showSuggestions && allSuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: '#253347', border: '1px solid rgba(148,163,184,0.15)',
                borderRadius: 12, overflow: 'hidden', zIndex: 200,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxHeight: 200, overflowY: 'auto',
              }}>
                {allSuggestions.map((item, i) => (
                  <div
                    key={item._type === 'local' ? `local-${item.id}` : `mealie-${item.slug}`}
                    onMouseDown={() => item._type === 'local' ? selectLocalMeal(item) : selectMealieRecipe(item)}
                    style={{
                      padding: '12px 16px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: i < allSuggestions.length - 1 ? '1px solid rgba(148,163,184,0.06)' : 'none',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(43,140,238,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ color: '#e2e8f0', fontSize: 14 }}>{item.name}</span>
                    <span style={{ color: item._type === 'mealie' ? '#2dd4bf' : '#64748b', fontSize: 12 }}>
                      {item._type === 'local'
                        ? (item.mealie_category_name || 'Uncategorised')
                        : (item.recipeCategory?.[0]?.name || item.mealie_category_name || 'Recipe')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Shelf life pills ── */}
          <div>
            <div style={s.label}>Shelf life</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {SHELF_PILLS.map(m => {
                const active = !isCustomExpiry && shelfMonths === m;
                return (
                  <button
                    key={m}
                    onClick={() => setShelf(m)}
                    style={{
                      flex: 1, height: 42,
                      background: active ? 'rgba(43,140,238,0.12)' : 'rgba(30,41,59,0.6)',
                      border: `1px solid ${active ? 'rgba(43,140,238,0.4)' : 'rgba(148,163,184,0.12)'}`,
                      borderRadius: 10, color: active ? '#2b8cee' : '#94a3b8',
                      fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
                    }}
                  >
                    {m}m
                  </button>
                );
              })}
              {/* Custom pill — display-only, activated by manual expiry edit */}
              <div
                style={{
                  flex: 1, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isCustomExpiry ? 'rgba(45,212,191,0.1)' : 'transparent',
                  border: `1px solid ${isCustomExpiry ? 'rgba(45,212,191,0.3)' : 'rgba(148,163,184,0.06)'}`,
                  borderRadius: 10,
                  color: isCustomExpiry ? '#2dd4bf' : '#334155',
                  fontSize: 14, fontWeight: 500,
                }}
              >
                Custom
              </div>
            </div>
          </div>

          {/* ── Summary row: Frozen / Portions / Expires ── */}
          <div style={{
            display: 'flex', alignItems: 'stretch',
            background: 'rgba(30,41,59,0.35)',
            border: '1px solid rgba(148,163,184,0.08)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            {/* Frozen date */}
            <div style={{ flex: 1, padding: '12px 14px' }}>
              <div style={s.cellLabel}>Frozen</div>
              <input
                type="date"
                value={freezeDate}
                onChange={e => setFreezeDate(e.target.value)}
                style={s.dateInput}
              />
            </div>

            <div style={{ width: 1, background: 'rgba(148,163,184,0.08)', flexShrink: 0 }} />

            {/* Portions */}
            <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ ...s.cellLabel, textAlign: 'center' }}>Portions</div>
              <div style={{ display: 'flex', alignItems: 'center', height: 28 }}>
                <button
                  onClick={() => setPortions(p => Math.max(1, p - 1))}
                  style={{ width: 28, height: 28, background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 8, color: '#94a3b8', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                >
                  −
                </button>
                <div style={{ width: 32, textAlign: 'center', fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>{portions}</div>
                <button
                  onClick={() => setPortions(p => p + 1)}
                  style={{ width: 28, height: 28, background: 'rgba(43,140,238,0.1)', border: '1px solid rgba(43,140,238,0.2)', borderRadius: 8, color: '#2b8cee', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                >
                  +
                </button>
              </div>
            </div>

            <div style={{ width: 1, background: 'rgba(148,163,184,0.08)', flexShrink: 0 }} />

            {/* Expiry date */}
            <div style={{ flex: 1, padding: '12px 14px' }}>
              <div style={s.cellLabel}>Expires</div>
              <input
                type="date"
                value={expiryDate}
                onChange={e => { setExpiryDate(e.target.value); setIsCustomExpiry(true); }}
                style={s.dateInput}
              />
            </div>
          </div>

          {/* ── Notes ── */}
          <div>
            <button
              onClick={() => setShowNotes(v => !v)}
              style={{ fontSize: 12, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
              onMouseLeave={e => e.currentTarget.style.color = '#475569'}
            >
              {showNotes ? '− Remove notes' : '+ Add notes'}
            </button>
            {showNotes && (
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes about this batch..."
                style={{
                  display: 'block', marginTop: 8, width: '100%', padding: '12px 14px',
                  background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(148,163,184,0.1)',
                  borderRadius: 10, color: '#f1f5f9', fontSize: 14, fontFamily: 'inherit',
                  outline: 'none', resize: 'none', height: 60,
                }}
              />
            )}
          </div>

          {/* ── Submit ── */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              width: '100%', padding: 16, border: 'none', borderRadius: 12,
              background: canSubmit ? '#2b8cee' : 'rgba(43,140,238,0.25)',
              color: canSubmit ? '#fff' : 'rgba(255,255,255,0.35)',
              fontSize: 16, fontWeight: 600, fontFamily: 'inherit',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'Adding...' : 'Add to Freezer'}
          </button>
        </div>
      </div>

      {/* Toast */}
      <div
        style={{
          position: 'fixed', bottom: 80, left: '50%',
          transform: `translateX(-50%) translateY(${toast ? 0 : 40}px)`,
          background: '#22c55e', color: '#fff', padding: '12px 24px',
          borderRadius: 12, fontSize: 14, fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 200,
          opacity: toast ? 1 : 0,
          transition: 'all 0.3s ease-out', pointerEvents: 'none',
        }}
      >
        ✓ Added to freezer
      </div>
    </>
  );
}

// ── Shared style objects ───────────────────────────────────────────────────────
const s = {
  label: {
    fontSize: 11, fontWeight: 500, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
  },
  input: {
    width: '100%', padding: '14px 16px',
    background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(148,163,184,0.15)',
    borderRadius: 12, color: '#f1f5f9', fontSize: 16, fontFamily: 'inherit', outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  cellLabel: {
    fontSize: 10, color: '#64748b', textTransform: 'uppercase',
    letterSpacing: '0.04em', marginBottom: 6, height: 13,
  },
  dateInput: {
    background: 'transparent', border: 'none', outline: 'none',
    color: '#f1f5f9', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
    padding: 0, width: '100%', cursor: 'pointer', colorScheme: 'dark',
  },
};
