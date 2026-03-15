import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, AlertCircle, ExternalLink, Trash2 } from 'lucide-react';
import { useMeal } from '../hooks/useMeals';
import { useSettings } from '../hooks/useSettings';
import { mealsApi } from '../services/api';
import QuickCounter from '../components/shared/QuickCounter';
import AddToFreezerSheet from '../components/shared/AddToFreezerSheet';
import { formatDate } from '../utils/dates';
import { buildExpiryMap } from '../utils/expiry';

function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  const dateOnly = String(dateStr).slice(0, 10);
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function daysSince(dateStr) {
  return Math.floor((todayMidnight() - parseLocalDate(dateStr)) / 86400000);
}

function daysUntil(dateStr) {
  return Math.floor((parseLocalDate(dateStr) - todayMidnight()) / 86400000);
}

// ── Batch card ───────────────────────────────────────────────────────────────
function BatchCard({ batch }) {
  const expires = daysUntil(batch.expiry_date);
  const isExpired = expires < 0;
  const isExpiringSoon = expires >= 0 && expires <= 14;

  const badgeClass = isExpired
    ? 'bg-red-500/10 border-red-500/20 text-red-400'
    : isExpiringSoon
    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
    : 'bg-green-500/10 border-green-500/20 text-green-400';

  const dotClass = isExpired ? 'bg-red-400' : isExpiringSoon ? 'bg-amber-400' : 'bg-green-400';

  const statusText = isExpired
    ? `Expired ${Math.abs(expires)}d ago`
    : isExpiringSoon
    ? `${expires} days left`
    : `Fresh (${expires}d left)`;

  return (
    <div className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1">
          <p className="font-semibold text-sm">
            {batch.portions_remaining} portion{batch.portions_remaining !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Frozen: {formatDate(batch.freeze_date)}</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border self-start text-xs font-medium ${badgeClass}`}>
          <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
          <span className="whitespace-nowrap">{statusText}</span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-3">Expiry: {formatDate(batch.expiry_date)}</p>
    </div>
  );
}

// ── Linked recipe card ───────────────────────────────────────────────────────
function LinkedRecipeCard({ meal, mealieUrl }) {
  const [imgError, setImgError] = useState(false);
  const safeBase = /^https?:\/\//i.test(mealieUrl) ? mealieUrl : '';
  const href = safeBase
    ? `${safeBase}/g/home/r/${encodeURIComponent(meal.mealie_recipe_slug)}`
    : undefined;

  return (
    <section className="bg-slate-800/50 border border-slate-700/20 rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
        <h2 className="text-base font-semibold">Linked Recipe</h2>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-4 sm:px-6 pb-4 sm:pb-6">
        {/* Image — full-width tall on mobile, square on sm+ */}
        <div className="w-full sm:w-24 h-36 sm:h-24 rounded-xl overflow-hidden shrink-0 bg-slate-700/50">
          {meal.image_url && !imgError ? (
            <img
              src={meal.image_url}
              alt={meal.name}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-3xl font-black text-slate-600">{meal.name.charAt(0)}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate mb-0.5">{meal.name}</h3>
          <p className="text-sm text-slate-500 mb-3">From Mealie</p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors w-full sm:w-auto"
          >
            <ExternalLink size={15} />
            View Recipe
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Activity entry ───────────────────────────────────────────────────────────
function ActivityEntry({ entry }) {
  const isAdd = entry.action === 'add';
  const label = isAdd
    ? `Added ${entry.quantity} portion${entry.quantity !== 1 ? 's' : ''}`
    : `Removed ${entry.quantity} portion${entry.quantity !== 1 ? 's' : ''}${entry.note ? ` (${entry.note})` : ''}`;

  const iconBg = isAdd ? 'bg-green-500/10' : 'bg-blue-500/10';
  const iconColor = isAdd ? 'text-green-400' : 'text-blue-400';

  return (
    <div className="flex gap-3 sm:gap-4 pb-6">
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full ${iconBg} flex items-center justify-center`}>
          {isAdd
            ? <Plus size={14} className={iconColor} />
            : <Minus size={14} className={iconColor} />
          }
        </div>
        <div className="w-px flex-1 bg-slate-800 mt-2" />
      </div>
      <div className="flex-1 pt-0.5 pb-2">
        <p className="text-sm font-medium">{label}</p>
        {entry.source && entry.source !== 'manual' && (
          <p className="text-xs text-slate-500 mt-0.5 capitalize">{entry.source}</p>
        )}
        <p className="text-xs text-slate-600 mt-1 uppercase tracking-wide">{formatDate(entry.created_at)}</p>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useMeal(id);
  const rawSettings = useSettings();
  const expiryDays = useMemo(() => buildExpiryMap(rawSettings), [rawSettings]);
  const mealieUrl = rawSettings?.mealie_url?.replace(/\/$/, '') || null;
  const [counterMode, setCounterMode] = useState(null); // 'add' | 'remove' | null
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  if (loading && !data) return <LoadingSkeleton />;
  if (error) return <ErrorState error={error} onBack={() => navigate(-1)} />;
  if (!data) return null;

  const { meal, batches, activity } = data;
  const activeBatches = batches.filter(b => b.portions_remaining > 0);
  const totalPortions = activeBatches.reduce((s, b) => s + b.portions_remaining, 0);
  const sortedAsc = [...activeBatches].sort((a, b) => new Date(a.freeze_date) - new Date(b.freeze_date));

  // Portion health breakdown
  const freshPortions     = activeBatches.filter(b => daysUntil(b.expiry_date) > 14).reduce((s, b) => s + b.portions_remaining, 0);
  const expiringPortions  = activeBatches.filter(b => { const d = daysUntil(b.expiry_date); return d >= 0 && d <= 14; }).reduce((s, b) => s + b.portions_remaining, 0);
  const expiredPortions   = activeBatches.filter(b => daysUntil(b.expiry_date) < 0).reduce((s, b) => s + b.portions_remaining, 0);

  const categoryName = meal.mealie_category_name || 'Uncategorised';

  async function handleRemove(count) {
    setActionLoading(true);
    setActionError(null);
    try {
      await mealsApi.decrement(id, { quantity: count, source: 'manual' });
      await reload();
      setCounterMode(null);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    setActionLoading(true);
    setActionError(null);
    try {
      await mealsApi.remove(id);
      navigate('/');
    } catch (e) {
      setActionError(e.message);
      setShowDeleteConfirm(false);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-bg-app border-b border-slate-800">
        <div className="px-4 md:px-0 md:pl-14 xl:pl-0 h-16 md:h-[72px] flex items-center justify-between gap-4">

            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-800 transition-colors shrink-0"
                aria-label="Go back"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-semibold truncate leading-tight">{meal.name}</h1>
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 px-2 py-0.5 rounded bg-slate-800/60 inline-block mt-0.5">
                  {categoryName}
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="hidden sm:flex w-10 h-10 items-center justify-center rounded-xl text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
              aria-label="Delete item"
            >
              <Trash2 size={18} />
            </button>

          </div>
      </header>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 md:px-8 py-6 pb-28 md:pb-10">
        <div className="grid lg:grid-cols-[1fr_0.65fr] gap-6 lg:gap-8 max-w-7xl">

          {/* ── Left column ──────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Portion summary */}
            <section className="bg-slate-800/50 border border-slate-700/20 rounded-2xl p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">
                    Total Portions
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl font-bold">{totalPortions}</span>
                    <span className="text-slate-400 text-base">portions</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCounterMode('remove')}
                    disabled={totalPortions === 0 || actionLoading}
                    className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl border-2 border-slate-700 hover:bg-slate-700/50 transition-colors disabled:opacity-30"
                    aria-label="Remove portions"
                  >
                    <Minus size={20} />
                  </button>
                  <button
                    onClick={() => setSheetOpen(true)}
                    disabled={actionLoading}
                    className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                    aria-label="Add portions"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              {/* Fresh / Expiring / Expired breakdown */}
              <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Fresh</p>
                  <p className="text-xl sm:text-2xl font-semibold text-green-400">{freshPortions}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Expiring</p>
                  <p className="text-xl sm:text-2xl font-semibold text-amber-400">{expiringPortions}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Expired</p>
                  <p className="text-xl sm:text-2xl font-semibold text-red-400">{expiredPortions}</p>
                </div>
              </div>
            </section>

            {/* Batch breakdown */}
            {activeBatches.length > 0 && (
              <section className="bg-slate-800/50 border border-slate-700/20 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-semibold">Batch Breakdown</h2>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Oldest First (FIFO)
                  </span>
                </div>
                <div className="space-y-3">
                  {sortedAsc.map(b => <BatchCard key={b.id} batch={b} />)}
                </div>
              </section>
            )}

            {/* Linked recipe */}
            {meal.mealie_recipe_slug && mealieUrl && (
              <LinkedRecipeCard meal={meal} mealieUrl={mealieUrl} />
            )}

            {/* Notes */}
            {meal.notes && (
              <section className="bg-slate-800/50 border border-slate-700/20 rounded-2xl p-4 sm:p-6">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">Notes</p>
                <p className="text-sm text-slate-300">{meal.notes}</p>
              </section>
            )}

            {/* Delete — mobile only (desktop has icon in header) */}
            <div className="sm:hidden pb-2">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-3 text-red-400 font-semibold text-sm flex items-center justify-center gap-2 rounded-xl hover:bg-red-500/10 transition-colors border border-red-500/20"
              >
                <Trash2 size={16} />
                Delete Item
              </button>
            </div>

          </div>

          {/* ── Right column ─────────────────────────────────────────── */}
          <div className="space-y-6">

            {activity.length > 0 && (
              <section className="bg-slate-800/50 border border-slate-700/20 rounded-2xl p-4 sm:p-6">
                <h2 className="text-base font-semibold mb-6">Activity History</h2>
                <div>
                  {activity.map(entry => (
                    <ActivityEntry key={entry.id} entry={entry} />
                  ))}
                </div>
              </section>
            )}

          </div>

        </div>
      </main>

      {/* ── Add batch sheet ─────────────────────────────────────────────── */}
      <AddToFreezerSheet
        isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setTimeout(reload, 350); }}
        prefillName={meal?.name}
      />

      {/* ── Quick counter sheet ─────────────────────────────────────────── */}
      {counterMode === 'remove' && (
        <QuickCounter
          meal={meal}
          mode="remove"
          initialCount={1}
          maxCount={totalPortions}
          expiryDays={expiryDays}
          onConfirm={(count) => handleRemove(count)}
          onClose={() => setCounterMode(null)}
        />
      )}

      {/* ── Action error toast ──────────────────────────────────────────── */}
      {actionError && (
        <div className="fixed bottom-4 left-4 right-4 z-[60] p-3 bg-red-500/90 rounded-xl text-white text-sm text-center">
          {actionError}
        </div>
      )}

      {/* ── Delete confirmation modal ───────────────────────────────────── */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div className="bg-bg-surface rounded-2xl p-6 w-full max-w-sm border border-slate-800 space-y-4">
              <h2 className="text-lg font-bold">Remove from inventory?</h2>
              <p className="text-slate-400 text-sm">
                This will permanently delete <strong>{meal.name}</strong> and all its batches and history.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 bg-slate-800 rounded-xl font-semibold hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="flex-1 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ── Supporting components ────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="px-4 md:px-8 py-6 animate-pulse">
      <div className="grid lg:grid-cols-[1fr_0.65fr] gap-6 max-w-7xl">
        <div className="space-y-6">
          <div className="h-44 bg-slate-800 rounded-2xl" />
          <div className="h-48 bg-slate-800 rounded-2xl" />
          <div className="h-36 bg-slate-800 rounded-2xl" />
        </div>
        <div>
          <div className="h-64 bg-slate-800 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function ErrorState({ error, onBack }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
      <AlertCircle size={48} className="text-red-400" />
      <div>
        <h2 className="text-lg font-semibold mb-1">Failed to load</h2>
        <p className="text-slate-400 text-sm">{error}</p>
      </div>
      <button onClick={onBack} className="px-6 py-3 bg-slate-800 rounded-xl font-semibold">
        Go Back
      </button>
    </div>
  );
}
