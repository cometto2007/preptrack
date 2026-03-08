// Get today's date as YYYY-MM-DD in the user's LOCAL timezone (not UTC)
export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Parse a YYYY-MM-DD string as LOCAL midnight (avoids UTC-shift in non-UTC timezones)
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "5 Mar 2026"
export function formatDate(dateStr) {
  if (!dateStr) return '';
  return parseLocalDate(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// "5 Mar"
export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  return parseLocalDate(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short',
  });
}

// "5 Mar 2026" for a long-form expiry label in the QuickCounter
export function formatExpiryLabel(dateStr) {
  return formatDate(dateStr);
}
