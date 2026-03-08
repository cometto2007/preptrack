import { useState, useEffect, useCallback } from 'react';
import { notificationsApi } from '../services/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/**
 * Returns { supported, permission, subscribed, subscribe, unsubscribe, loading, error }
 */
export function usePushNotifications() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check current subscription on mount
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub);
      });
    });
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      const { key } = await notificationsApi.getVapidKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const { endpoint, keys } = sub.toJSON();
      await notificationsApi.subscribe({ endpoint, keys });
      setSubscribed(true);
    } catch (err) {
      console.error('[push] subscribe failed:', err.message);
      setError(err.message || 'Failed to enable notifications');
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
    } catch (err) {
      console.error('[push] unsubscribe failed:', err.message);
      setError(err.message || 'Failed to disable notifications');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, permission, subscribed, subscribe, unsubscribe, loading, error };
}
