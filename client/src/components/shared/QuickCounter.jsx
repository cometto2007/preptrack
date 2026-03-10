import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { localDateStr, formatDate } from '../../utils/dates';
import { calcExpiry, DEFAULT_EXPIRY_DAYS } from '../../utils/expiry';

// Helper to clamp count between 0 and max
function normalizeCount(count, max) {
  const maxVal = max ?? Infinity;
  // Guard against negative max
  const safeMax = maxVal < 0 ? 0 : maxVal;
  return Math.max(0, Math.min(count, safeMax));
}

/**
 * QuickCounter - Bottom sheet overlay for specifying portion count.
 *
 * TWO MODES:
 *
 * 1. SINGLE-ITEM MODE (backward compatible):
 *    - Pass: meal, mode, initialCount, maxCount, expiryDays
 *    - add mode: onConfirm(count, freezeDate, expiryDate)
 *    - remove mode: onConfirm(count)
 *
 * 2. MULTI-ITEM MODE (v2):
 *    - Pass: items (array), title, mode, expiryDays
 *    - items: [{ id, name, maxCount, initialCount? }, ...]
 *    - add mode: onConfirm([{ id, count, freezeDate, expiryDate }, ...])
 *    - remove mode: onConfirm([{ id, count }, ...])
 *    - Shows per-item rows with independent counters
 *    - Includes "Set All" convenience action
 */

// Individual counter row for multi-item mode
function ItemRow({ item, count, index, onChange }) {
  const canDecrease = count > 0;
  const canIncrease = item.maxCount == null || count < item.maxCount;

  const handleDecrease = useCallback(() => {
    if (canDecrease) onChange(index, count - 1);
  }, [canDecrease, onChange, index, count]);

  const handleIncrease = useCallback(() => {
    if (canIncrease) onChange(index, count + 1);
  }, [canIncrease, onChange, index, count]);

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{item.name}</p>
        {item.maxCount != null && (
          <p className="text-xs text-slate-500 mt-0.5">
            {item.maxCount} available
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleDecrease}
          disabled={!canDecrease}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors active:scale-95"
          aria-label={`Decrease ${item.name}`}
        >
          <Minus size={16} />
        </button>
        <span 
          className="w-8 text-center text-base font-bold tabular-nums"
          aria-live="polite"
          aria-atomic="true"
        >
          {count}
        </span>
        <button
          type="button"
          onClick={handleIncrease}
          disabled={!canIncrease}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors active:scale-95"
          aria-label={`Increase ${item.name}`}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

// Wrapper that memoizes the row - only re-renders if props actually change
const MemoizedItemRow = memo(ItemRow);

export default function QuickCounter({
  // Single-item mode props
  meal,
  initialCount = 2,
  maxCount,

  // Multi-item mode props
  items, // Array of { id, name, maxCount?, initialCount? }
  title, // Title for multi-item mode

  // Common props
  mode = 'add',
  expiryDays = DEFAULT_EXPIRY_DAYS,
  onConfirm,
  onClose,
}) {
  // Detect mode: multi-item if 'items' array is provided with at least one item
  const isMultiItem = Array.isArray(items) && items.length > 0;
  
  // Edge case: empty items array flag (must render after all hooks)
  const isEmptyItemsArray = Array.isArray(items) && items.length === 0;

  // Single-item state - clamped to maxCount on init
  const [count, setCount] = useState(() => normalizeCount(initialCount, maxCount));
  const [freezeDate, setFreezeDate] = useState(localDateStr());

  // Multi-item state: array of counts aligned with items array - properly clamped
  const [multiCounts, setMultiCounts] = useState(() => {
    if (!isMultiItem) return [];
    return items.map(item => normalizeCount(item.initialCount ?? 0, item.maxCount));
  });

  // Track previous items config to detect changes (IDs, initialCount, maxCount)
  const prevConfigRef = useRef(null);
  
  // Reset state when initialCount changes
  useEffect(() => {
    setCount(normalizeCount(initialCount, maxCount));
  }, [initialCount, maxCount]);

  // Initialize multi-item counts when items config actually changes
  useEffect(() => {
    if (!isMultiItem) return;
    
    // Create a config signature that includes IDs, initialCount, and maxCount
    const currentConfig = items.map(i => `${i.id}:${i.initialCount ?? 0}:${i.maxCount ?? '∞'}`).join('|');
    const prevConfig = prevConfigRef.current;
    
    // Only reset counts if the items config has actually changed
    if (currentConfig !== prevConfig) {
      setMultiCounts(items.map(item => normalizeCount(item.initialCount ?? 0, item.maxCount)));
      prevConfigRef.current = currentConfig;
    }
  }, [isMultiItem, items]);

  const expiryDate = mode === 'add'
    ? calcExpiry(freezeDate, expiryDays)
    : null;

  // Single-item handlers
  const canDecrease = count > 0;
  const canIncrease = maxCount == null || count < maxCount;

  const handleSingleConfirm = useCallback(() => {
    if (typeof onConfirm !== 'function') {
      console.error('QuickCounter: onConfirm is not a function');
      return;
    }
    if (mode === 'add') {
      onConfirm(count, freezeDate, expiryDate);
    } else {
      onConfirm(count);
    }
  }, [onConfirm, mode, count, freezeDate, expiryDate]);

  // Multi-item handlers - uses functional update to avoid stale closures
  const handleItemCountChange = useCallback((index, value) => {
    setMultiCounts(prev => {
      const currentItem = items[index];
      if (!currentItem) return prev;
      const normalized = normalizeCount(value, currentItem.maxCount);
      return prev.map((c, i) => (i === index ? normalized : c));
    });
  }, [items]);

  function handleSetAll() {
    if (!isMultiItem) return;
    // Check if any items can be set to at least 1
    const hasSettableItems = items.some(item => (item.maxCount ?? Infinity) > 0);
    if (!hasSettableItems) return;
    setMultiCounts(items.map(item => {
      // Set to min(1, max) but if max is 0, set to 0
      if (item.maxCount === 0) return 0;
      const max = item.maxCount ?? Infinity;
      return Math.min(1, max);
    }));
  }

  function handleClearAll() {
    if (!isMultiItem) return;
    setMultiCounts(items.map(() => 0));
  }

  const handleMultiConfirm = useCallback(() => {
    if (!isMultiItem) return;
    if (typeof onConfirm !== 'function') {
      console.error('QuickCounter: onConfirm is not a function');
      return;
    }

    // Only include items with count > 0
    const results = items
      .map((item, i) => {
        const count = multiCounts[i] ?? 0;
        if (count === 0) return null;
        if (mode === 'add') {
          return {
            id: item.id,
            count,
            freezeDate,
            expiryDate,
          };
        } else {
          return {
            id: item.id,
            count,
          };
        }
      })
      .filter(Boolean);

    onConfirm(results);
  }, [isMultiItem, onConfirm, items, multiCounts, mode, freezeDate, expiryDate]);

  const anyMultiCounted = isMultiItem && multiCounts.some(c => c > 0);
  const allMultiZero = isMultiItem && multiCounts.every(c => c === 0);

  // Handle Escape key to close
  useEffect(() => {
    if (typeof onClose !== 'function') return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Render empty state (after all hooks)
  if (isEmptyItemsArray) {
    return (
      <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45]" onClick={onClose} />
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
          <div className="w-full max-w-md bg-bg-app rounded-t-2xl shadow-2xl border-t border-slate-800 p-6">
            <p className="text-slate-400 text-center">No items to display</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full mt-4 py-3 bg-slate-800 rounded-lg text-slate-300"
            >
              Close
            </button>
          </div>
        </div>
      </>
    );
  }

  // Title determination
  const headerTitle = isMultiItem
    ? (title || (mode === 'add' ? 'Add Portions' : 'Remove Portions'))
    : (mode === 'add' ? 'Add Portions' : 'Remove Portions');

  const mealName = isMultiItem
    ? null
    : (meal?.name ?? '');

  return (
    <>
      {/* Backdrop — z-[45] sits above BottomNav (z-40) but below the sheet (z-50) */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45]" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
        <div 
          className={`
            w-full max-w-md bg-bg-app rounded-t-2xl shadow-2xl border-t border-slate-800 overflow-hidden
            flex flex-col max-h-[80vh]
          `}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quickcounter-title"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="h-1.5 w-12 rounded-full bg-slate-700" />
          </div>

          {/* Title */}
          <div className="px-6 pt-4 pb-2 text-center shrink-0">
            <p 
              id="quickcounter-title"
              className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1"
            >
              {headerTitle}
            </p>
            {mealName && <h2 className="text-xl font-bold">{mealName}</h2>}
          </div>

          {/* Content - scrollable for multi-item */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {isMultiItem ? (
              /* Multi-item mode */
              <div className="px-6 py-2">
                {/* Set All / Clear All shortcuts */}
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={handleSetAll}
                    disabled={!items.some(item => (item.maxCount ?? Infinity) > 0)}
                    className="flex-1 py-2 px-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-800 transition-colors disabled:opacity-40"
                  >
                    Set All to 1
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    disabled={allMultiZero}
                    className="flex-1 py-2 px-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 text-xs font-medium hover:bg-slate-800 transition-colors disabled:opacity-40"
                  >
                    Clear All
                  </button>
                </div>

                {/* Per-item rows */}
                <div className="divide-y divide-slate-800/50">
                  {items.map((item, i) => (
                    <MemoizedItemRow
                      key={item.id}
                      item={item}
                      count={multiCounts[i] ?? 0}
                      index={i}
                      onChange={handleItemCountChange}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* Single-item mode */
              <div className="flex items-center justify-between py-10 px-6 max-w-xs mx-auto w-full">
                <button
                  type="button"
                  onClick={() => canDecrease && setCount(c => c - 1)}
                  disabled={!canDecrease}
                  aria-label="Decrease portion count"
                  className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                >
                  <Minus size={28} />
                </button>

                <div className="flex flex-col items-center">
                  <span 
                    className="text-7xl font-bold leading-none"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {count}
                  </span>
                  <span className="text-slate-400 text-sm font-medium mt-1">portions</span>
                </div>

                <button
                  type="button"
                  onClick={() => canIncrease && setCount(c => c + 1)}
                  disabled={!canIncrease}
                  aria-label="Increase portion count"
                  className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-40"
                >
                  <Plus size={28} />
                </button>
              </div>
            )}

            {/* Date info — add mode only; freeze date is tappable */}
            {mode === 'add' && (
              <div className="px-6 py-4 flex flex-col gap-2 items-center bg-slate-800/30">
                <label className="flex items-center gap-2 text-slate-400 text-sm cursor-pointer">
                  <span>Freeze date:</span>
                  <input
                    type="date"
                    value={freezeDate}
                    onChange={e => setFreezeDate(e.target.value)}
                    className="bg-transparent border-b border-slate-600 text-slate-200 font-semibold focus:outline-none focus:border-primary"
                  />
                </label>
                {expiryDate && (
                  <p className="text-slate-500 text-xs">
                    Expires: <strong className="text-slate-400">{formatDate(expiryDate)}</strong>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-6 pt-4 flex flex-col gap-3 safe-bottom shrink-0 bg-bg-app border-t border-slate-800/50">
            {isMultiItem ? (
              <button
                type="button"
                onClick={handleMultiConfirm}
                disabled={!anyMultiCounted}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-40"
              >
                {mode === 'add' ? 'Confirm Freezing' : 'Confirm Removal'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSingleConfirm}
                disabled={count === 0}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-40"
              >
                {mode === 'add'
                  ? 'Confirm Freezing'
                  : `Remove ${count} Portion${count !== 1 ? 's' : ''}`}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-slate-400 font-medium text-sm hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
