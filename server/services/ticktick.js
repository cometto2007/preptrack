/**
 * TickTick integration — creates/updates tasks via the TickTick Open API v2.
 * https://developer.ticktick.com/docs
 */

const TICKTICK_API = 'https://api.ticktick.com/open/v1';

async function ttFetch(token, path, method = 'GET', body = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(`${TICKTICK_API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...(body != null ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  return res;
}

/**
 * Create a TickTick task.
 * Returns the created task object (including its id and projectId).
 */
async function createTask(token, listId, title, content, items = []) {
  const body = { title, content, kind: 'CHECKLIST' };
  if (listId && listId !== 'inbox') body.projectId = listId;
  if (items.length > 0) {
    body.items = items.map((text, i) => ({ id: String(i + 1), title: text, status: 0 }));
  }

  const res = await ttFetch(token, '/task', 'POST', body);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`TickTick API error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Fetch a task by projectId + taskId.
 * Returns null if the task doesn't exist (404).
 */
async function getTask(token, projectId, taskId) {
  const res = await ttFetch(
    token,
    `/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`TickTick API error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Update an existing task (title, content, items).
 * taskId and projectId must be passed in the body per the TickTick API spec.
 */
async function updateTask(token, taskId, body) {
  const res = await ttFetch(token, `/task/${encodeURIComponent(taskId)}`, 'POST', body);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`TickTick API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function getProjects(token) {
  const res = await ttFetch(token, '/project');
  if (!res.ok) return [];
  return res.json();
}

module.exports = { createTask, getTask, updateTask, getProjects };
