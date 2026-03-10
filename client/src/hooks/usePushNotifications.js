import { useState, useEffect, useCallback } from 'react';
import { notificationsApi } from '../services/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/**
 * Returns { supported, permission, subscribed, currentEndpoint, subscribe, unsubscribe, loading, error }
 */
export function usePushNotifications() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied');
  const [subscribed, setSubscribed] = useState(false);
  const [currentEndpoint, setCurrentEndpoint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check current subscription on mount
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub);
        setCurrentEndpoint(sub?.endpoint || null);
      });
    });
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);
    try {
      if (!window.isSecureContext) {
        throw new Error('Push notifications require a secure context (HTTPS or localhost).');
      }
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      const { key } = await notificationsApi.getVapidKey();
      const subscribeOnce = async (reg) => {
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          try { await notificationsApi.unsubscribe(existing.endpoint); } catch {}
          try { await existing.unsubscribe(); } catch {}
        }
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      };

      let reg = await navigator.serviceWorker.ready;
      let sub;
      try {
        sub = await subscribeOnce(reg);
      } catch (firstErr) {
        // Self-heal path for stale/broken SW registrations.
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => {})));
        await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        reg = await navigator.serviceWorker.ready;
        sub = await subscribeOnce(reg);
      }

      const { endpoint, keys } = sub.toJSON();
      await notificationsApi.subscribe({ endpoint, keys });
      setSubscribed(true);
      setCurrentEndpoint(endpoint || null);
    } catch (err) {
      console.error('[push] subscribe failed:', err.message);
      const msg = err?.message || 'Failed to enable notifications';
      const name = err?.name || 'Error';
      const lower = String(msg).toLowerCase();
      if (lower.includes('push service error')) {
        setError(
          `Push registration failed (${name}: ${msg}). ` +
          'Use http://localhost:5173, ensure browser push service is enabled ' +
          '(Brave: "Use Google services for push messaging"), and disable VPN/firewall blocks.'
        );
      } else {
        setError(`${name}: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await notificationsApi.unsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setCurrentEndpoint(null);
    } catch (err) {
      console.error('[push] unsubscribe failed:', err.message);
      setError(err.message || 'Failed to disable notifications');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, permission, subscribed, currentEndpoint, subscribe, unsubscribe, loading, error };
}
