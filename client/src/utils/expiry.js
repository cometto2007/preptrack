export const DEFAULT_EXPIRY_DAYS = 90;

// Build expiry days value from GET /api/settings response object.
export function buildExpiryMap(settings) {
  const parsed = Number(settings?.default_expiry_days);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRY_DAYS;
}

// Calculate expiry date string (YYYY-MM-DD) from a freeze date string.
export function calcExpiry(freezeDateStr, expiryDays = DEFAULT_EXPIRY_DAYS) {
  // Parse as UTC so date-only strings don't shift with timezone
  const [y, mo, d] = freezeDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  date.setUTCDate(date.getUTCDate() + expiryDays);
  return date.toISOString().split('T')[0];
}
