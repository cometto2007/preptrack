import { useState, useEffect } from 'react';
import { settingsApi } from '../services/api';

// Fetches /api/settings once and returns the flat settings object.
// Returns null while loading (callers should fall back to defaults).
export function useSettings() {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    settingsApi.get()
      .then(({ settings }) => setSettings(settings))
      .catch(() => {}); // silently fall back to hardcoded defaults
  }, []);
  return settings;
}
