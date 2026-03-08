import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMealiePlan } from '../hooks/useMealiePlan';
import { localDateStr, formatDateShort } from '../utils/dates';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function StatusBadge({ status, portions }) {
  if (status === 'covered') {
    return (
      <span className="px-2 py-1 text-[10px] font-bold rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-wide">
        In Freezer ({portions})
      </span>
    );
  }
  if (status === 'low') {
    return (
      <span className="px-2 py-1 text-[10px] font-bold rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-wide">
        Low ({portions})
      </span>
    );
  }
  if (status === 'missing') {
    return (
      <span className="px-2 py-1 text-[10px] font-bold rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 uppercase tracking-wide">
        Missing
      </span>
    );
  }
  if (status === 'unplanned') {
    return (
      <span className="px-2 py-1 text-[10px] font-bold rounded bg-slate-700 text-slate-400 border border-slate-600 uppercase tracking-wide">
        Unplanned
      </span>
    );
  }
  if (status === 'off') {
    return (
      <span className="px-2 py-1 text-[10px] font-bold rounded bg-slate-800 text-slate-500 border border-slate-700 uppercase tracking-wide">
        Off
      </span>
    );
  }
  return null;
}

function SlotRow({ day, slot, isToday, isPast, navigate }) {
  const needsAction = slot.status === 'missing' || slot.status === 'unplanned';
  const isOff = slot.status === 'off';

  return (
    <div className={`flex items-center gap-4 px-4 py-4 transition-colors
      ${isPast ? 'opacity-40' : ''}
      ${isOff ? 'bg-slate-900/20' : 'hover:bg-slate-900/40'}
    `}>
      <div className="flex flex-col min-w-[60px]">
        <span className="text-xs font-bold text-slate-400 uppercase">{DOW[day.dayOfWeek]}</span>
        <span className="text-sm font-semibold capitalize">{slot.type}</span>
      </div>
      <div className="flex-1 min-w-0">
        {slot.recipeName ? (
          <p className="font-medium truncate">{slot.recipeName}</p>
        ) : (
          <p className={`font-medium italic ${isOff ? 'text-slate-600' : 'text-slate-500'}`}>
            {isOff ? 'Off' : 'Not planned'}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={slot.status} portions={slot.portions} />
        {needsAction && (
          <button
            onClick={() => navigate('/add', {
              state: {
                name: slot.recipeName || '',
                mealieSlug: slot.slug || null,
              },
            })}
            className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors bg-primary/5 px-2 py-1 rounded border border-primary/10 min-h-[32px]"
          >
            <span className="text-[10px] font-bold uppercase">Add</span>
          </button>
        )}
      </div>
    </div>
  );
}

function DaySkeleton() {
  return (
    <div className="space-y-px animate-pulse">
      <div className="h-4 bg-slate-800 rounded mx-4 my-3 w-32" />
      <div className="h-14 bg-slate-800/50 mx-0" />
      <div className="h-14 bg-slate-800/50 mx-0" />
    </div>
  );
}

export default function Plan() {
  const [days, setDays] = useState(7);
  const { data, loading, error } = useMealiePlan(days);
  const navigate = useNavigate();
  const today = localDateStr();

  const DAY_OPTIONS = [7, 14, 30];

  // Compute summary
  const summary = data?.summary ?? { total: 0, covered: 0, low: 0, missing: 0 };
  const coverageCount = summary.covered + summary.low;
  const coveragePct = summary.total > 0 ? Math.round((coverageCount / summary.total) * 100) : 0;

  // SVG circle progress
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (coveragePct / 100) * circumference;

  return (
    <div className="flex flex-col min-h-full pb-24">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-bg-app/80 backdrop-blur-md px-4 py-4 flex items-center justify-between border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-tight">Plan</h1>
      </header>

      <main className="flex-1 space-y-4 pt-4">
        {/* Day range toggle */}
        <div className="px-4">
          <div className="flex h-11 items-center justify-center rounded-xl bg-slate-900 p-1 gap-1">
            {DAY_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`flex-1 flex items-center justify-center rounded-lg h-full text-sm font-medium transition-colors
                  ${days === d
                    ? 'bg-slate-800 shadow-sm text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {d} days
              </button>
            ))}
          </div>
        </div>

        {/* Summary card */}
        <div className="px-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-slate-400 text-sm font-medium">Coverage</p>
                {loading ? (
                  <div className="h-6 w-40 bg-slate-800 rounded animate-pulse mt-1" />
                ) : (
                  <h3 className="text-xl font-bold mt-1">
                    {coverageCount} of {summary.total} meals covered
                  </h3>
                )}
              </div>
              <div className="relative flex items-center justify-center">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle
                    className="text-slate-800"
                    cx="32" cy="32" r={radius}
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="6"
                  />
                  <circle
                    className="text-primary"
                    cx="32" cy="32" r={radius}
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeDasharray={circumference}
                    strokeDashoffset={loading ? circumference : dashOffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                  />
                </svg>
                <span className="absolute text-xs font-bold">
                  {loading ? '—' : `${coveragePct}%`}
                </span>
              </div>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: loading ? '0%' : `${coveragePct}%` }}
              />
            </div>
            {!loading && summary.missing > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                {summary.missing} meal{summary.missing !== 1 ? 's' : ''} still need{summary.missing === 1 ? 's' : ''} to be covered.
              </p>
            )}
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mx-4 p-4 rounded-xl bg-slate-900 border border-slate-700 text-center">
            <p className="text-slate-400 text-sm mb-2">Could not load meal plan.</p>
            {error.toLowerCase().includes('configured') ? (
              <p className="text-xs text-slate-500">
                Connect Mealie in{' '}
                <button
                  onClick={() => navigate('/settings')}
                  className="text-primary underline"
                >
                  Settings
                </button>
              </p>
            ) : (
              <p className="text-xs text-slate-500">{error}</p>
            )}
          </div>
        )}

        {/* Skeleton */}
        {loading && !error && (
          <div className="space-y-6 mt-2">
            <DaySkeleton />
            <DaySkeleton />
            <DaySkeleton />
          </div>
        )}

        {/* Day list */}
        {!loading && !error && data && (
          <div className="border-t border-slate-800">
            {data.days.map(day => {
              const isPast = day.date < today;
              const isToday = day.date === today; // computed client-side to avoid server UTC skew
              const allOff = day.slots.every(s => s.status === 'off');

              return (
                <div key={day.date} className={isPast ? 'opacity-50' : ''}>
                  {/* Day separator */}
                  <div className={`flex items-center gap-3 px-4 py-3 border-b border-slate-800 ${isPast ? '' : ''}`}>
                    {isToday && (
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                    )}
                    {!isToday && (
                      <span className="h-2 w-2 rounded-full bg-slate-700 shrink-0" />
                    )}
                    <span className={`text-xs font-bold uppercase tracking-widest ${isToday ? 'text-primary' : 'text-slate-400'}`}>
                      {formatDateShort(day.date)}
                      {isToday && ' · Today'}
                    </span>
                    <div className={`h-px flex-1 ${isToday ? 'bg-primary/20' : 'bg-slate-800'}`} />
                  </div>

                  {/* Collapsed weekend row */}
                  {allOff ? (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/20">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-500 uppercase">{DOW[day.dayOfWeek]}</span>
                        <span className="text-sm font-semibold text-slate-500 italic">Off</span>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/50 border-b border-slate-800">
                      {day.slots.map(slot => (
                        <SlotRow
                          key={slot.type}
                          day={day}
                          slot={slot}
                          isToday={isToday}
                          isPast={isPast}
                          navigate={navigate}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer summary */}
        {!loading && !error && data && summary.missing > 0 && (
          <div className="mx-4 mb-4">
            <div className="bg-slate-900/30 border border-slate-800/50 rounded-lg py-3 px-4 flex items-center justify-center gap-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                {summary.missing} meal{summary.missing !== 1 ? 's' : ''} uncovered — add individually above
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
