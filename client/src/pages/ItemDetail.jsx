import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, CheckCircle, AlertCircle, ExternalLink, Trash2 } from 'lucide-react';
import { useMeal } from '../hooks/useMeals';
import { useSettings } from '../hooks/useSettings';
import { mealsApi } from '../services/api';
import QuickCounter from '../components/shared/QuickCounter';
import AddToFreezerSheet from '../components/shared/AddToFreezerSheet';
import { formatDate } from '../utils/dates';
import { buildExpiryMap } from '../utils/expiry';

function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  const dateOnly = String(dateStr).slice(0, 10); // supports both YYYY-MM-DD and full ISO timestamp
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight, not UTC
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

function ActivityIcon({ action }) {
  if (action === 'add') return <Plus size={14} className="text-emerald-400" />;
  if (action === 'remove') return <Minus size={14} className="text-rose-400" />;
  return <span className="text-slate-400 text-xs">•</span>;
}

function ActivityEntry({ entry }) {
  const label = entry.action === 'add'
    ? `Added ${entry.quantity} portion${entry.quantity !== 1 ? 's' : ''}`
    : `Removed ${entry.quantity} portion${entry.quantity !== 1 ? 's' : ''}${entry.note ? ` (${entry.note})` : ''}`;

  return (
    <div className="relative flex items-start gap-4 pb-6 group">
      <div className="z-10 flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 border-2 border-slate-800">
        <ActivityIcon action={entry.action} />
      </div>
      <div className="flex flex-1 justify-between items-start pt-0.5">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          {entry.source && entry.source !== 'manual' && (
            <p className="text-xs text-slate-500 mt-0.5 capitalize">{entry.source}</p>
          )}
        </div>
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-tight pt-0.5 flex-shrink-0 ml-2">
          {formatDate(entry.created_at)}
        </p>
      </div>
    </div>
  );
}

function BatchRow({ batch }) {
  const frozen = daysSince(batch.freeze_date);
  const expires = daysUntil(batch.expiry_date);
  const isExpired = expires < 0;
  const isExpiringSoon = expires >= 0 && expires <= 14;

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
      <div>
        <p className="text-sm font-medium">{batch.portions_remaining} portions</p>
        <p className="text-xs text-slate-500">Frozen {frozen}d ago · {formatDate(batch.freeze_date)}</p>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
        isExpired ? 'text-red-400 bg-red-500/10' :
        isExpiringSoon ? 'text-amber-400 bg-amber-500/10' :
        'text-green-400 bg-green-500/10'
      }`}>
        {isExpired ? 'Expired' : `${expires}d left`}
      </span>
    </div>
  );
}

export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useMeal(id);
  const rawSettings = useSettings();
  const expiryDays = useMemo(() => buildExpiryMap(rawSettings), [rawSettings]);
  const mealieUrl = rawSettings?.mealie_url?.replace(/\/$/, '') || null;
  const [counterMode, setCounterMode] = useState(null); // 'add' | 'remove' | null
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBatches, setShowBatches] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState error={error} onBack={() => navigate(-1)} />;
  if (!data) return null;

  const { meal, batches, activity } = data;
  const activeBatches = batches.filter(b => b.portions_remaining > 0);
  const totalPortions = activeBatches.reduce((s, b) => s + b.portions_remaining, 0);
  // Copy before sorting to avoid mutating the same array twice
  const sortedAsc  = [...activeBatches].sort((a, b) => new Date(a.freeze_date) - new Date(b.freeze_date));
  const sortedDesc = [...activeBatches].sort((a, b) => new Date(b.freeze_date) - new Date(a.freeze_date));
  const earliestBatch = sortedAsc[0];
  const latestBatch   = sortedDesc[0];
  const frozenDays = latestBatch ? daysSince(latestBatch.freeze_date) : null;
  const expiresInDays = earliestBatch ? daysUntil(earliestBatch.expiry_date) : null;
  const isExpired = expiresInDays !== null && expiresInDays < 0;
  const isExpiringSoon = expiresInDays !== null && expiresInDays >= 0 && expiresInDays <= 14;
  const categoryName = meal.mealie_category_name || 'Uncategorised';

  async function handleAdjust(count, freezeDate, expiryDate) {
    setActionLoading(true);
    setActionError(null);
    try {
      if (counterMode === 'add') {
        await mealsApi.increment(id, { portions: count, freeze_date: freezeDate, expiry_date: expiryDate });
      } else {
        await mealsApi.decrement(id, { quantity: count, source: 'manual' });
      }
      await reload();
      setCounterMode(null);
    } catch (e) {
      setActionError(e.message);
      // Keep sheet open on error so user can retry or cancel
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
      setActionLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-bg-app/80 backdrop-blur-md px-4 py-3 flex items-center gap-3 border-b border-slate-800">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-slate-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold flex-1 truncate">{meal.name}</h1>
      </header>

      <main className="flex-1 p-4 pb-8 space-y-6 max-w-2xl">
        {/* Hero */}
        <div>
          <span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-semibold uppercase tracking-wider">
            {categoryName}
          </span>
          <h1 className="text-3xl font-bold tracking-tight mt-2">{meal.name}</h1>
        </div>

        {/* Portion counter card */}
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium mb-1">Available Stock</p>
              <p className="text-4xl font-black text-primary">{totalPortions} portions</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCounterMode('remove')}
                disabled={totalPortions === 0 || actionLoading}
                className="size-12 rounded-lg bg-slate-700 flex items-center justify-center hover:bg-slate-600 transition-colors disabled:opacity-30"
              >
                <Minus size={20} />
              </button>
              <button
                onClick={() => setCounterMode('add')}
                disabled={actionLoading}
                className="size-12 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Status */}
        {earliestBatch && (
          <div className={`flex items-center gap-3 p-4 rounded-lg border ${
            isExpired ? 'bg-red-500/5 border-red-500/20' :
            isExpiringSoon ? 'bg-amber-500/5 border-amber-500/20' :
            'bg-emerald-500/5 border-emerald-500/20'
          }`}>
            {isExpired || isExpiringSoon
              ? <AlertCircle size={18} className={isExpired ? 'text-red-400' : 'text-amber-400'} />
              : <CheckCircle size={18} className="text-emerald-400" />
            }
            <p className="text-sm">
              {frozenDays !== null && (
                <span className="text-slate-300 font-medium">
                  Frozen {frozenDays} day{frozenDays !== 1 ? 's' : ''} ago
                </span>
              )}
              <span className="text-slate-500 mx-1">·</span>
              <span className={`font-semibold ${
                isExpired ? 'text-red-400' :
                isExpiringSoon ? 'text-amber-400' :
                'text-emerald-400'
              }`}>
                {isExpired
                  ? `Expired ${Math.abs(expiresInDays)} days ago`
                  : `Expires in ${expiresInDays} days`
                }
              </span>
            </p>
          </div>
        )}

        {/* Batches (collapsible) */}
        {activeBatches.length > 0 && (
          <div className="bg-slate-800/30 rounded-xl border border-slate-800">
            <button
              onClick={() => setShowBatches(v => !v)}
              className="w-full flex items-center justify-between p-4 text-sm font-semibold"
            >
              <span>Batches ({activeBatches.length})</span>
              <span className="text-slate-400 text-xs">{showBatches ? 'Hide' : 'Show'}</span>
            </button>
            {showBatches && (
              <div className="px-4 pb-4">
                {activeBatches.map(b => <BatchRow key={b.id} batch={b} />)}
              </div>
            )}
          </div>
        )}

        {/* Mealie recipe link */}
        {meal.mealie_recipe_slug && mealieUrl && (
          <MealieLink slug={meal.mealie_recipe_slug} name={meal.name} baseUrl={mealieUrl} />
        )}

        {/* Activity log */}
        {activity.length > 0 && (
          <div>
            <h3 className="text-lg font-bold mb-4">Activity Log</h3>
            <div className="relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-slate-800 before:via-slate-800 before:to-transparent">
              {activity.map(entry => (
                <ActivityEntry key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {meal.notes && (
          <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Notes</p>
            <p className="text-sm text-slate-300">{meal.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={() => setSheetOpen(true)}
            className="flex-1 py-3 px-4 bg-slate-800 font-bold rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            Add Batch
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="py-3 px-4 text-red-400 font-bold rounded-lg hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </main>

      {/* Add batch sheet */}
      <AddToFreezerSheet
        isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); reload(); }}
        prefillName={meal?.name}
      />

      {/* Quick counter sheet */}
      {counterMode && (
        <QuickCounter
          meal={meal}
          mode={counterMode}
          initialCount={counterMode === 'add' ? 2 : 1}
          maxCount={counterMode === 'remove' ? totalPortions : undefined}
          expiryDays={expiryDays}
          onConfirm={handleAdjust}
          onClose={() => setCounterMode(null)}
        />
      )}

      {/* Action error toast */}
      {actionError && (
        <div className="fixed bottom-4 left-4 right-4 z-[60] p-3 bg-red-500/90 rounded-xl text-white text-sm text-center">
          {actionError}
        </div>
      )}

      {/* Delete confirmation */}
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

function MealieLink({ slug, name, baseUrl }) {
  const safeBase = /^https?:\/\//i.test(baseUrl) ? baseUrl : '';
  return (
    <a
      href={safeBase ? `${safeBase}/g/home/r/${encodeURIComponent(slug)}` : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 bg-slate-800/30 rounded-xl border border-slate-800 hover:border-primary/40 transition-colors"
    >
      <ExternalLink size={18} className="text-primary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{name}</p>
        <p className="text-xs text-slate-500">View recipe in Mealie</p>
      </div>
    </a>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      <div className="h-8 bg-slate-800 rounded w-1/3" />
      <div className="h-10 bg-slate-800 rounded w-2/3" />
      <div className="h-32 bg-slate-800 rounded-xl" />
      <div className="h-16 bg-slate-800 rounded-xl" />
      <div className="space-y-3">
        <div className="h-4 bg-slate-800 rounded w-1/4" />
        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-800 rounded-xl" />)}
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
