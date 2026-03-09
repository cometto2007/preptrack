import { useState, useEffect, useCallback } from 'react';
import {
  Bell, Calendar, Snowflake, Link2, Database, ShoppingCart,
  RefreshCw, Download, Trash2, X, Clock,
} from 'lucide-react';
import { settingsApi, mealieApi, ticktickApi } from '../services/api';
import { usePushNotifications } from '../hooks/usePushNotifications';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// schedule.day_of_week: 0=Sun…6=Sat; we display Mon-Sun so map index 0→1…5→6→0
const DISPLAY_TO_DOW = [1, 2, 3, 4, 5, 6, 0];

const SYNC_OPTS = ['manual', '6h', 'daily'];

// ── Section header ──────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={16} className="text-primary shrink-0" />
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</h2>
    </div>
  );
}

// ── Inline-save text/number input ───────────────────────────────────────────
function SettingField({ label, settingKey, value, type = 'text', placeholder, masked, onSave }) {
  const [local, setLocal] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(value ?? ''); }, [value]);

  async function save() {
    if (local === (value ?? '')) return;
    setSaving(true);
    try {
      await onSave({ [settingKey]: local });
    } catch {
      setLocal(value ?? ''); // roll back on error
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-500 font-medium">{label}</label>
      <input
        type={masked ? 'password' : type}
        value={local}
        placeholder={placeholder}
        onChange={e => setLocal(e.target.value)}
        onBlur={save}
        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/60 min-h-[44px]"
      />
      {saving && <p className="text-[10px] text-slate-500">Saving…</p>}
    </div>
  );
}

// ── Expiry days row ─────────────────────────────────────────────────────────
function ExpiryRow({ label, settingKey, value, onSave }) {
  const [local, setLocal] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(value ?? ''); }, [value]);

  async function save() {
    if (local === (value ?? '')) return;
    const parsed = parseInt(local, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) { setLocal(value ?? ''); return; }
    setSaving(true);
    try {
      await onSave({ [settingKey]: String(parsed) });
    } catch {
      setLocal(value ?? ''); // roll back on error
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-3.5 border-b border-slate-800/60 last:border-0">
      <span className="text-sm text-slate-200">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={save}
          className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-center text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary/60"
        />
        <span className="text-xs text-slate-500">days{saving ? ' …' : ''}</span>
      </div>
    </div>
  );
}

// ── Schedule day cell ────────────────────────────────────────────────────────
function DayCell({ day, lunchEnabled, dinnerEnabled, onToggle }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      <button
        onClick={() => onToggle(day, 'lunch', !lunchEnabled)}
        title={`${lunchEnabled ? 'Disable' : 'Enable'} lunch`}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          lunchEnabled ? 'bg-primary/20 text-primary' : 'bg-slate-800/60 text-slate-600'
        }`}
      >
        <span className="text-base leading-none">🍱</span>
      </button>
      <button
        onClick={() => onToggle(day, 'dinner', !dinnerEnabled)}
        title={`${dinnerEnabled ? 'Disable' : 'Enable'} dinner`}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          dinnerEnabled ? 'bg-primary/20 text-primary' : 'bg-slate-800/60 text-slate-600'
        }`}
      >
        <span className="text-base leading-none">🍽️</span>
      </button>
    </div>
  );
}

export default function Settings() {
  const { supported, subscribed, subscribe, unsubscribe, loading: pushLoading, error: pushError } = usePushNotifications();

  const [settings, setSettings]     = useState({});
  const [schedule, setSchedule]     = useState([]); // 7 rows from DB (day_of_week 0–6)
  const [overrides, setOverrides]   = useState([]);
  const [weekStart, setWeekStart]   = useState('');
  const [syncStatus, setSyncStatus] = useState(null); // null | 'syncing' | 'ok' | 'error'
  const [clearing, setClearing]     = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearDone, setClearDone]   = useState(false);
  const [exportError, setExportError] = useState(null);
  // Controlled state for prompt time inputs (initialized from settings once loaded)
  const [lunchTime, setLunchTime]   = useState('15:00');
  const [dinnerTime, setDinnerTime] = useState('20:00');

  // Load everything on mount
  const load = useCallback(async () => {
    try {
      const [settRes, schedRes, ovRes] = await Promise.all([
        settingsApi.get(),
        settingsApi.getSchedule(),
        settingsApi.getOverrides(),
      ]);
      const s = settRes.settings || {};
      setSettings(s);
      setLunchTime(s.lunch_prompt_time  || '15:00');
      setDinnerTime(s.dinner_prompt_time || '20:00');
      setSchedule(schedRes.schedule || []);
      setOverrides(ovRes.overrides || []);
      setWeekStart(ovRes.week_start || '');
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveSettings(updates) {
    await settingsApi.update(updates);
    setSettings(s => ({ ...s, ...updates }));
  }

  // Schedule toggle
  async function handleScheduleToggle(displayIdx, mealType, enabled) {
    const dow = DISPLAY_TO_DOW[displayIdx];
    const row = schedule.find(r => r.day_of_week === dow) || { lunch_enabled: true, dinner_enabled: true };
    const body = {
      lunch_enabled:  mealType === 'lunch'  ? enabled : row.lunch_enabled,
      dinner_enabled: mealType === 'dinner' ? enabled : row.dinner_enabled,
    };
    await settingsApi.updateSchedule(dow, body);
    setSchedule(prev => prev.map(r =>
      r.day_of_week === dow ? { ...r, ...body } : r
    ));
  }

  // Override removal
  async function removeOverride(ws, dow, mt) {
    await settingsApi.deleteOverride(ws, dow, mt);
    setOverrides(prev => prev.filter(o =>
      !(o.week_start === ws && o.day_of_week === dow && o.meal_type === mt)
    ));
  }

  // TickTick OAuth connect
  function handleConnectTickTick() {
    const popup = window.open('/api/ticktick/auth', 'ticktick-oauth', 'width=620,height=720,noopener=no');
    if (!popup) {
      alert('Popup was blocked — allow popups for this site and try again.');
      return;
    }
    function onMessage(e) {
      if (e.data?.type !== 'ticktick-oauth') return;
      window.removeEventListener('message', onMessage);
      load(); // reload settings to reflect new token status
    }
    window.addEventListener('message', onMessage);
  }

  // TickTick shopping list reset
  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState(null); // null | 'ok' | 'error'
  async function handleResetShoppingList() {
    setResetting(true);
    try {
      await ticktickApi.resetShoppingList();
      setResetStatus('ok');
      setTimeout(() => setResetStatus(null), 3000);
    } catch {
      setResetStatus('error');
      setTimeout(() => setResetStatus(null), 3000);
    } finally {
      setResetting(false);
    }
  }

  // Mealie sync
  async function handleSync() {
    setSyncStatus('syncing');
    try {
      await mealieApi.sync();
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus(null), 3000);
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(null), 4000);
    }
  }

  // Export
  function handleExport() {
    setExportError(null);
    settingsApi.export().then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `preptrack-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(() => {
      setExportError('Export failed — check server logs');
      setTimeout(() => setExportError(null), 4000);
    });
  }

  // Clear inventory
  async function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return; }
    setClearing(true);
    setConfirmClear(false);
    try {
      await settingsApi.clearInventory();
      setClearDone(true);
      setTimeout(() => setClearDone(false), 4000);
    } finally {
      setClearing(false);
    }
  }

  // Helper: get schedule row by display index
  function getRow(displayIdx) {
    const dow = DISPLAY_TO_DOW[displayIdx];
    return schedule.find(r => r.day_of_week === dow) || { lunch_enabled: true, dinner_enabled: true };
  }

  // Helper: format override label
  function overrideLabel(o) {
    const dayName = DAYS[DISPLAY_TO_DOW.indexOf(o.day_of_week)] || `Day ${o.day_of_week}`;
    const meal    = o.meal_type.charAt(0).toUpperCase() + o.meal_type.slice(1);
    const type    = o.override_type === 'dining_out' ? 'Dining Out' : 'Disabled';
    return `${dayName} ${meal} → ${type}`;
  }

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto space-y-8 pb-24">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-400">Notifications, schedule &amp; integrations</p>
      </header>

      {/* ── Notification Preferences ───────────────────────────────────── */}
      <section>
        <SectionHeader icon={Bell} title="Notification Preferences" />
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
          {/* Push toggle */}
          {supported && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-200">Push Notifications</p>
                <p className="text-xs text-slate-500">Real-time prompts on this device</p>
              </div>
              <button
                disabled={pushLoading}
                onClick={subscribed ? unsubscribe : subscribe}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  subscribed ? 'bg-primary' : 'bg-slate-700'
                }`}
              >
                <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${
                  subscribed ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          )}
          {pushError && <p className="text-red-400 text-xs">{pushError}</p>}

          {/* Telegram */}
          <SettingField
            label="Telegram Bot Token"
            settingKey="telegram_bot_token"
            value=""
            placeholder="Paste token to update"
            masked
            onSave={saveSettings}
          />
          <SettingField
            label="Telegram Chat ID"
            settingKey="telegram_chat_id"
            value={settings.telegram_chat_id}
            placeholder="e.g. 123456789"
            onSave={saveSettings}
          />

          {/* Prompt times — controlled so they update when settings load */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-500 font-medium flex items-center gap-1">
                <Clock size={11} /> Lunch Prompt
              </label>
              <input
                type="time"
                value={lunchTime}
                onChange={e => setLunchTime(e.target.value)}
                onBlur={() => saveSettings({ lunch_prompt_time: lunchTime })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary/60 min-h-[44px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500 font-medium flex items-center gap-1">
                <Clock size={11} /> Dinner Prompt
              </label>
              <input
                type="time"
                value={dinnerTime}
                onChange={e => setDinnerTime(e.target.value)}
                onBlur={() => saveSettings({ dinner_prompt_time: dinnerTime })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary/60 min-h-[44px]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Weekly Schedule ────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={Calendar} title="Weekly Schedule" />
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-800">
            {DAYS.map((d, i) => (
              <div
                key={d}
                className={`py-2 text-center text-[10px] font-bold ${
                  i >= 5 ? 'text-primary' : 'text-slate-500'
                } border-r border-slate-800/50 last:border-r-0`}
              >
                {d.toUpperCase()}
              </div>
            ))}
          </div>
          {/* Toggle cells */}
          <div className="grid grid-cols-7">
            {DAYS.map((d, i) => {
              const row = getRow(i);
              return (
                <div key={d} className="border-r border-slate-800/50 last:border-r-0">
                  <DayCell
                    day={i}
                    lunchEnabled={!!row.lunch_enabled}
                    dinnerEnabled={!!row.dinner_enabled}
                    onToggle={handleScheduleToggle}
                  />
                </div>
              );
            })}
          </div>

          {/* This week's overrides */}
          {overrides.length > 0 && (
            <div className="border-t border-slate-800 px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                This week's overrides
              </p>
              {overrides.map(o => (
                <div
                  key={`${o.day_of_week}-${o.meal_type}`}
                  className="flex items-center justify-between text-xs text-slate-400"
                >
                  <span className="text-primary font-medium">{overrideLabel(o)}</span>
                  <button
                    onClick={() => removeOverride(o.week_start, o.day_of_week, o.meal_type)}
                    className="p-1 hover:text-red-400 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Freezer Defaults ───────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={Snowflake} title="Freezer Defaults" />
        <div className="rounded-xl bg-slate-900 border border-slate-800 px-4">
          <ExpiryRow
            label="Default freezer expiry"
            settingKey="default_expiry_days"
            value={settings.default_expiry_days ?? '90'}
            onSave={saveSettings}
          />
          <ExpiryRow
            label="Defrost lead time"
            settingKey="defrost_lead_time"
            value={settings.defrost_lead_time ?? '1'}
            onSave={saveSettings}
          />
        </div>
      </section>

      {/* ── Mealie Integration ─────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={Link2} title="Mealie Integration" />
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
          <SettingField
            label="Mealie URL"
            settingKey="mealie_url"
            value={settings.mealie_url}
            placeholder="https://mealie.yourdomain.com"
            onSave={saveSettings}
          />
          <SettingField
            label="API Key"
            settingKey="mealie_api_key"
            value=""
            placeholder="Paste new key to update"
            masked
            onSave={saveSettings}
          />

          {/* Sync frequency */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 font-medium">Sync Frequency</label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
              {SYNC_OPTS.map(opt => {
                const active = (settings.sync_frequency || '6h') === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => saveSettings({ sync_frequency: opt })}
                    className={`py-2 rounded-md text-xs font-semibold transition-colors capitalize ${
                      active ? 'bg-primary text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt === '6h' ? '6h' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sync now */}
          <button
            onClick={handleSync}
            disabled={syncStatus === 'syncing'}
            className="flex w-full items-center justify-center gap-2 h-11 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-sm transition-colors disabled:opacity-60"
          >
            <RefreshCw size={15} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
            {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'ok' ? 'Synced!' : syncStatus === 'error' ? 'Sync failed' : 'Sync Now'}
          </button>
        </div>
      </section>

      {/* ── TickTick Integration ───────────────────────────────────────── */}
      <section>
        <SectionHeader icon={ShoppingCart} title="TickTick Integration" />
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
          <SettingField
            label="Client ID"
            settingKey="ticktick_client_id"
            value={settings.ticktick_client_id}
            placeholder="e.g. 59LnVBKwJeRmv4TD4F"
            onSave={saveSettings}
          />
          <SettingField
            label="Client Secret"
            settingKey="ticktick_client_secret"
            value=""
            placeholder="Paste to update"
            masked
            onSave={saveSettings}
          />

          {/* Connection status + button */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-sm font-medium text-slate-200">Connection</p>
              <p className={`text-xs mt-0.5 ${settings.ticktick_api_token ? 'text-green-400' : 'text-slate-500'}`}>
                {settings.ticktick_api_token ? 'Connected' : 'Not connected'}
              </p>
            </div>
            <button
              onClick={handleConnectTickTick}
              disabled={!settings.ticktick_client_id}
              className="px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {settings.ticktick_api_token ? 'Reconnect' : 'Connect'}
            </button>
          </div>

          <SettingField
            label="List ID (optional)"
            settingKey="ticktick_list_id"
            value={settings.ticktick_list_id}
            placeholder="Leave blank for Inbox"
            onSave={saveSettings}
          />

          {/* Reset shopping list */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <div>
              <p className="text-sm font-medium text-slate-200">Shopping List</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {resetStatus === 'ok' ? 'Reset — next add will create a fresh task'
                  : resetStatus === 'error' ? 'Reset failed'
                  : 'If you deleted the task in TickTick, reset here'}
              </p>
            </div>
            <button
              onClick={handleResetShoppingList}
              disabled={resetting}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors disabled:opacity-40"
            >
              {resetting ? 'Resetting…' : 'Reset'}
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Register <span className="text-slate-400 font-mono">{window.location.origin}/api/ticktick/callback</span> as the OAuth Redirect URL in your{' '}
            <a href="https://developer.ticktick.com" target="_blank" rel="noreferrer" className="text-primary underline">TickTick developer app</a>.
          </p>
        </div>
      </section>

      {/* ── Data Management ────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={Database} title="Data Management" />
        <div className="rounded-xl bg-slate-900 border border-slate-800 divide-y divide-slate-800 overflow-hidden">
          <button
            onClick={handleExport}
            className="flex w-full items-center justify-between px-4 py-4 hover:bg-slate-800/60 transition-colors min-h-[56px]"
          >
            <div className="flex items-center gap-3">
              <Download size={16} className={exportError ? 'text-red-400' : 'text-slate-400'} />
              <span className={`text-sm font-medium ${exportError ? 'text-red-400' : 'text-slate-200'}`}>
                {exportError || 'Export data (JSON)'}
              </span>
            </div>
            <span className="text-slate-500 text-xs">→</span>
          </button>

          <button
            onClick={handleClear}
            disabled={clearing}
            className={`flex w-full items-center justify-between px-4 py-4 transition-colors min-h-[56px] ${
              confirmClear
                ? 'bg-red-900/40 hover:bg-red-900/60'
                : 'hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Trash2 size={16} className={clearDone ? 'text-green-400' : 'text-red-400'} />
              <span className={`text-sm font-medium ${
                clearDone ? 'text-green-400' : confirmClear ? 'text-red-300' : 'text-red-400'
              }`}>
                {clearDone
                  ? 'Inventory cleared'
                  : confirmClear
                  ? 'Tap again to confirm — this cannot be undone'
                  : 'Clear all inventory'}
              </span>
            </div>
            {clearing ? (
              <RefreshCw size={14} className="text-red-400 animate-spin" />
            ) : (
              <span className={`text-xs ${clearDone ? 'text-green-500' : 'text-red-500'}`}>→</span>
            )}
          </button>
        </div>

        {confirmClear && (
          <button
            onClick={() => setConfirmClear(false)}
            className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        )}
      </section>

      <p className="text-center text-[11px] text-slate-600 pb-4">
        PrepTrack · Meal Prep Manager
      </p>
    </div>
  );
}
