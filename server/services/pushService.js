const webpush = require('web-push');
const pool = require('../db/connection');

// VAPID keys must be set in environment variables.
// Generate once with: node -e "const wp=require('web-push');console.log(wp.generateVAPIDKeys())"
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT     || '';

let vapidConfigured = false;
if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidConfigured = true;
} else {
  console.warn('[push] VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must all be set — push notifications disabled');
}

async function sendToSubscriptionRow(sub, payload) {
  if (!vapidConfigured) return { attempted: 0, sent: 0, failed: 0, removed: 0 };
  const json = JSON.stringify(payload);
  const subscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
  };
  try {
    await webpush.sendNotification(subscription, json);
    return { attempted: 1, sent: 1, failed: 0, removed: 0 };
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
      return { attempted: 1, sent: 0, failed: 1, removed: 1 };
    }
    console.error(`[push] Failed to send to ${sub.endpoint}:`, err.message);
    return { attempted: 1, sent: 0, failed: 1, removed: 0 };
  }
}

/**
 * Send a push notification to all stored subscriptions.
 * Payload: { title, body, url, actions? }
 * Dead subscriptions (410/404) are removed automatically.
 */
async function sendToAll(payload) {
  if (!vapidConfigured) {
    return { attempted: 0, sent: 0, failed: 0, removed: 0 };
  }

  const { rows } = await pool.query(
    'SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions'
  );
  if (!rows.length) {
    return { attempted: 0, sent: 0, failed: 0, removed: 0 };
  }

  const json = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.allSettled(
    rows.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
      };
      try {
        await webpush.sendNotification(subscription, json);
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription is gone — clean up
          pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id])
            .catch(dbErr => console.error(`[push] Failed to remove dead subscription ${sub.id}:`, dbErr.message));
          removed++;
        } else {
          console.error(`[push] Failed to send to ${sub.endpoint}:`, err.message);
        }
      }
    })
  );

  return { attempted: rows.length, sent, failed, removed };
}

module.exports = { sendToAll, sendToSubscriptionRow, vapidPublicKey: VAPID_PUBLIC, vapidConfigured };
