// Canonical expiry defaults — must match settings table seeds in 001_initial_schema.sql
export const EXPIRY_DAYS = {
  'Meals':       90,
  'Soups':       180,
  'Sauces':      180,
  'Baked Goods': 90,
  'Ingredients': 180,
  'Other':       90,
};

// Calculate expiry date string (YYYY-MM-DD) from a category and freeze date string
export function calcExpiry(category, freezeDateStr) {
  const days = EXPIRY_DAYS[category] ?? 90;
  // Parse as UTC so date-only strings don't shift with timezone
  const [y, mo, d] = freezeDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}
