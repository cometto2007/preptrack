/**
 * TickTick integration — creates tasks via the TickTick Open API v2.
 * Requires TICKTICK_ACCESS_TOKEN (OAuth2 access token obtained externally).
 * https://developer.ticktick.com/docs
 */

const TICKTICK_API = 'https://api.ticktick.com/open/v1';

/**
 * Create a TickTick task in the specified list.
 * @param {string} token   OAuth access token
 * @param {string} listId  TickTick project ID (or "inbox" for default inbox)
 * @param {string} title   Task title
 * @param {string} content Task body / description
 */
async function createTask(token, listId, title, content, items = []) {
  const body = { title, content };
  if (listId && listId !== 'inbox') body.projectId = listId;
  if (items.length > 0) {
    body.items = items.map((text, i) => ({ id: String(i + 1), title: text, status: 0 }));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(`${TICKTICK_API}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`TickTick API error ${res.status}: ${text}`);
  }
  return res.json();
}

module.exports = { createTask };
