import { useState, useEffect, useCallback } from 'react';
import {
  Bell, Calendar, Snowflake, Link2, Database, ShoppingCart,
  RefreshCw, Download, Trash2, X, Clock,
} from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import { settingsApi, mealieApi, ticktickApi } from '../services/api';
import { usePushNotifications } from '../hooks/usePushNotifications';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// schedule.day_of_week: 0=Sun…6=Sat; we display Mon-Sun so map index 0→1…5→6→0
const DISPLAY_TO_DOW = [1, 2, 3, 4, 5, 6, 0];

const SYNC_OPTS = ['manual', '6h', 'daily'];

// ── Card section header (lives INSIDE the card) ──────────────────────────────
function CardHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <Icon size={16} className="text-primary shrink-0" />
      <h2 className="text-xs font-medium uppercase tracking-widest text-slate-400">{title}</h2>
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
      setLocal(value ?? '');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-200">{label}</label>
      <input
        type={masked ? 'password' : type}
        value={local}
        placeholder={placeholder}
        onChange={e => setLocal(e.target.value)}
        onBlur={save}
        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary/60 min-h-[44px]"
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
      setLocal(value ?? '');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0">
      <span className="text-slate-200">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={save}
          className="w-16 bg-slate-950 border border-slate-800 rounded text-slate-200 text-center text-sm px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/60"
        />
        <span className="text-slate-400 text-sm">days{saving ? ' …' : ''}</span>
      </div>
    </div>
  );
}

// ── Schedule day column (label + lunch + dinner buttons) ─────────────────────
function DayCol({ day, label, lunchEnabled, dinnerEnabled, onToggle }) {
  return (
    <div className="text-center">
      <div className="text-xs text-slate-400 mb-2">{label}</div>
      <div className="space-y-2">
        <button
          onClick={() => onToggle(day, 'lunch', !lunchEnabled)}
          title={`${lunchEnabled ? 'Disable' : 'Enable'} lunch`}
          className={`w-9 h-9 rounded-lg flex items-center justify-center mx-auto text-xs font-medium transition-colors ${
            lunchEnabled ? 'bg-primary/20 text-primary' : 'bg-slate-800/60 text-slate-600'
          }`}
        >
          L
        </button>
        <button
          onClick={() => onToggle(day, 'dinner', !dinnerEnabled)}
          title={`${dinnerEnabled ? 'Disable' : 'Enable'} dinner`}
          className={`w-9 h-9 rounded-lg flex items-center justify-center mx-auto text-xs font-medium transition-colors ${
            dinnerEnabled ? 'bg-primary/20 text-primary' : 'bg-slate-800/60 text-slate-600'
          }`}
        >
          D
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const {
    supported,
    subscribed,
    subscribe,
    unsubscribe,
    loading: pushLoading,
    error: pushError,
  } = usePushNotifications();

  const [settings, setSettings]     = useState({});
  const [schedule, setSchedule]     = useState([]);
  const [overrides, setOverrides]   = useState([]);
  const [weekStart, setWeekStart]   = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [clearing, setClearing]     = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearDone, setClearDone]   = useState(false);
  const [exportError, setExportError] = useState(null);
  const [lunchTime, setLunchTime]   = useState('15:00');
  const [dinnerTime, setDinnerTime] = useState('20:00');

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

  async function removeOverride(ws, dow, mt) {
    await settingsApi.deleteOverride(ws, dow, mt);
    setOverrides(prev => prev.filter(o =>
      !(o.week_start === ws && o.day_of_week === dow && o.meal_type === mt)
    ));
  }

  function handleConnectTickTick() {
    const popup = window.open('/api/ticktick/auth', 'ticktick-oauth', 'width=620,height=720,noopener');
    if (!popup) {
      alert('Popup was blocked — allow popups for this site and try again.');
      return;
    }
    function onMessage(e) {
      if (e.data?.type !== 'ticktick-oauth') return;
      window.removeEventListener('message', onMessage);
      load();
    }
    window.addEventListener('message', onMessage);
  }

  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState(null);
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

  function getRow(displayIdx) {
    const dow = DISPLAY_TO_DOW[displayIdx];
    return schedule.find(r => r.day_of_week === dow) || { lunch_enabled: true, dinner_enabled: true };
  }

  function overrideLabel(o) {
    const dayName = DAYS[DISPLAY_TO_DOW.indexOf(o.day_of_week)] || `Day ${o.day_of_week}`;
    const meal    = o.meal_type.charAt(0).toUpperCase() + o.meal_type.slice(1);
    const type    = o.override_type === 'dining_out' ? 'Dining Out' : 'Disabled';
    return `${dayName} ${meal} → ${type}`;
  }

  return (
    <div className="pb-24 md:pb-10">
      <PageHeader
        title="Settings"
        subtitle="Configure your meal prep preferences and integrations"
        sticky
      />

      <div className="px-4 md:px-0 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8">

          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Weekly Schedule */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <CardHeader icon={Calendar} title="Weekly Schedule" />
              <div className="grid grid-cols-7 gap-2">
                {DAYS.map((d, i) => {
                  const row = getRow(i);
                  return (
                    <DayCol
                      key={d}
                      day={i}
                      label={d.toUpperCase()}
                      lunchEnabled={!!row.lunch_enabled}
                      dinnerEnabled={!!row.dinner_enabled}
                      onToggle={handleScheduleToggle}
                    />
                  );
                })}
              </div>
              {overrides.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
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

            {/* Notification Preferences */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
              <CardHeader icon={Bell} title="Notification Preferences" />

              {supported ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-200 font-medium">Push Notifications</p>
                    <p className="text-sm text-slate-400">Real-time prompts on this device</p>
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
              ) : (
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                  <p className="text-sm font-medium text-slate-200">Push notifications unavailable</p>
                  <p className="text-xs text-slate-400 mt-1">
                    This browser does not support web push for this app context.
                  </p>
                </div>
              )}
              {pushError && <p className="text-red-400 text-xs">{pushError}</p>}

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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-200 flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400" /> Lunch Prompt
                  </label>
                  <input
                    type="time"
                    value={lunchTime}
                    onChange={e => setLunchTime(e.target.value)}
                    onBlur={() => saveSettings({ lunch_prompt_time: lunchTime })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary/60 min-h-[44px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-200 flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400" /> Dinner Prompt
                  </label>
                  <input
                    type="time"
                    value={dinnerTime}
                    onChange={e => setDinnerTime(e.target.value)}
                    onBlur={() => saveSettings({ dinner_prompt_time: dinnerTime })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary/60 min-h-[44px]"
                  />
                </div>
              </div>
            </div>

            {/* Freezer Defaults */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <CardHeader icon={Snowflake} title="Freezer Defaults" />
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

          </div>

          {/* ── Right column ────────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Mealie Integration */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
              <CardHeader icon={Link2} title="Mealie Integration" />

              <SettingField
                label="URL"
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

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-200">Sync Frequency</label>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-1">
                  <div className="grid grid-cols-3 gap-1">
                    {SYNC_OPTS.map(opt => {
                      const active = (settings.sync_frequency || '6h') === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => saveSettings({ sync_frequency: opt })}
                          className={`px-3 py-2 text-sm rounded transition-colors ${
                            active ? 'bg-primary text-white' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {opt === '6h' ? '6h' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSync}
                disabled={syncStatus === 'syncing'}
                className="w-full h-11 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <RefreshCw size={15} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'ok' ? 'Synced!' : syncStatus === 'error' ? 'Sync failed' : 'Sync Now'}
              </button>
            </div>

            {/* TickTick Integration */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
              <CardHeader icon={ShoppingCart} title="TickTick Integration" />

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

              <div className="flex items-center justify-between py-3 border-t border-slate-800">
                <div>
                  <span className="text-slate-200">Connection</span>
                  <div className={`text-sm mt-0.5 ${settings.ticktick_api_token ? 'text-green-400' : 'text-slate-500'}`}>
                    {settings.ticktick_api_token ? 'Connected' : 'Not connected'}
                  </div>
                </div>
                <button
                  onClick={handleConnectTickTick}
                  disabled={!settings.ticktick_client_id}
                  className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {settings.ticktick_api_token ? 'Reconnect' : 'Connect'}
                </button>
              </div>

              <SettingField
                label="List ID (optional)"
                settingKey="ticktick_list_id"
                value={settings.ticktick_list_id}
                placeholder="Leave empty for default list"
                onSave={saveSettings}
              />

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div>
                  <p className="text-slate-200 font-medium">Shopping List</p>
                  <p className="text-sm text-slate-400">
                    {resetStatus === 'ok' ? 'Reset — next add will create a fresh task'
                      : resetStatus === 'error' ? 'Reset failed'
                      : 'Clear current shopping list items'}
                  </p>
                </div>
                <button
                  onClick={handleResetShoppingList}
                  disabled={resetting}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {resetting ? 'Resetting…' : 'Reset'}
                </button>
              </div>

              <div className="text-xs text-slate-500">
                <div className="mb-1">OAuth Redirect URL:</div>
                <div className="font-mono bg-slate-950 p-2 rounded border border-slate-800 break-all">
                  {window.location.origin}/api/ticktick/callback
                </div>
              </div>
            </div>

            {/* Data Management */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 pt-6 pb-2">
                <CardHeader icon={Database} title="Data Management" />
              </div>
              <div className="divide-y divide-slate-800">
                <button
                  onClick={handleExport}
                  className="flex w-full items-center justify-between px-6 py-4 min-h-14 hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Download size={16} className={exportError ? 'text-red-400' : 'text-slate-400'} />
                    <span className={`${exportError ? 'text-red-400' : 'text-slate-200'}`}>
                      {exportError || 'Export data (JSON)'}
                    </span>
                  </div>
                  <span className="text-slate-400 text-sm">›</span>
                </button>

                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className={`flex w-full items-center justify-between px-6 py-4 min-h-14 transition-colors cursor-pointer ${
                    confirmClear ? 'bg-red-900/40 hover:bg-red-900/60' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Trash2 size={16} className={clearDone ? 'text-green-400' : 'text-red-400'} />
                    <span className={clearDone ? 'text-green-400' : confirmClear ? 'text-red-300' : 'text-red-400'}>
                      {clearDone
                        ? 'Inventory cleared'
                        : confirmClear
                        ? 'Tap again to confirm — this cannot be undone'
                        : 'Clear all inventory'}
                    </span>
                  </div>
                  {clearing
                    ? <RefreshCw size={14} className="text-red-400 animate-spin" />
                    : <span className={`text-sm ${clearDone ? 'text-green-500' : 'text-red-400'}`}>›</span>
                  }
                </button>
              </div>
              {confirmClear && (
                <div className="px-6 pb-4">
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        <p className="text-center text-xs text-slate-600 py-8">
          PrepTrack · Meal Prep Manager
        </p>
      </div>
    </div>
  );
}
