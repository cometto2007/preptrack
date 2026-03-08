// Canonical expiry defaults — must match settings table seeds in 001_initial_schema.sql
export const EXPIRY_DAYS = {
  'Meals':       90,
  'Soups':       180,
  'Sauces':      180,
  'Baked Goods': 90,
  'Ingredients': 180,
  'Other':       90,
};

// Build a category→days map from the settings object returned by GET /api/settings
export function buildExpiryMap(settings) {
  if (!settings) return EXPIRY_DAYS;
  return {
    'Meals':       Number(settings.expiry_days_meals)       || EXPIRY_DAYS['Meals'],
    'Soups':       Number(settings.expiry_days_soups)       || EXPIRY_DAYS['Soups'],
    'Sauces':      Number(settings.expiry_days_sauces)      || EXPIRY_DAYS['Sauces'],
    'Baked Goods': Number(settings.expiry_days_baked_goods) || EXPIRY_DAYS['Baked Goods'],
    'Ingredients': Number(settings.expiry_days_ingredients) || EXPIRY_DAYS['Ingredients'],
    'Other':       Number(settings.expiry_days_other)       || EXPIRY_DAYS['Other'],
  };
}

// Calculate expiry date string (YYYY-MM-DD) from a category and freeze date string.
// daysMap defaults to the hardcoded EXPIRY_DAYS but can be overridden with live settings.
export function calcExpiry(category, freezeDateStr, daysMap = EXPIRY_DAYS) {
  const days = daysMap[category] ?? 90;
  // Parse as UTC so date-only strings don't shift with timezone
  const [y, mo, d] = freezeDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}
