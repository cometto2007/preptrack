const cron = require('node-cron');
const pool = require('../db/connection');
const mealieSync = require('./mealieSync');
const { sendToAll } = require('./pushService');

// Returns today's date as YYYY-MM-DD in server local time
function localDateStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// Add n days to a YYYY-MM-DD string using local-date arithmetic
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Returns the day-of-week (0=Sun) for a YYYY-MM-DD string
function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Afternoon job: checks tomorrow's lunch plan.
 * Creates a reservation + sends push if there is freezer stock.
 */
async function runLunchPrompt() {
  try {
    const tomorrow = addDays(localDateStr(), 1);
    const dow = dayOfWeek(tomorrow);

    // Check schedule
    const { rows: schedRows } = await pool.query(
      'SELECT lunch_enabled FROM schedule WHERE day_of_week = $1', [dow]
    );
    if (!schedRows[0]?.lunch_enabled) return;

    // Check for override
    const weekStart = addDays(tomorrow, -dow); // Monday is relative — use Sunday as week_start
    const { rows: overrideRows } = await pool.query(
      `SELECT override_type FROM schedule_overrides
       WHERE week_start = $1 AND day_of_week = $2 AND meal_type = 'lunch'`,
      [weekStart, dow]
    );
    if (overrideRows[0]?.override_type === 'disabled') return;

    // Skip if reservation already exists for tomorrow lunch
    const { rows: existing } = await pool.query(
      `SELECT id FROM reservations WHERE meal_plan_date = $1 AND meal_type = 'lunch' AND status = 'pending'`,
      [tomorrow]
    );
    if (existing.length) return;

    // Fetch Mealie plan for tomorrow
    let planEntries = [];
    try {
      planEntries = await mealieSync.getMealPlan(tomorrow, tomorrow);
    } catch {
      return; // Mealie not configured or unreachable — skip
    }

    const lunchEntry = planEntries.find(e => (e.entry_type || e.entryType || '').toLowerCase() === 'lunch');
    if (!lunchEntry?.recipe?.slug) return;

    const slug = lunchEntry.recipe.slug;

    // Find PrepTrack meal + freezer stock
    const { rows: mealRows } = await pool.query(
      `SELECT m.id, m.name, COALESCE(SUM(b.portions_remaining), 0)::int AS stock
       FROM meals m
       LEFT JOIN batches b ON b.meal_id = m.id AND b.portions_remaining > 0
       WHERE m.mealie_recipe_slug = $1
       GROUP BY m.id`,
      [slug]
    );
    const meal = mealRows[0];
    if (!meal || meal.stock === 0) return; // nothing to defrost

    // Create reservation
    const { rows: resRows } = await pool.query(
      `INSERT INTO reservations (meal_id, meal_plan_date, meal_type)
       VALUES ($1, $2, 'lunch')
       ON CONFLICT (meal_plan_date, meal_type) DO NOTHING
       RETURNING id`,
      [meal.id, tomorrow]
    );
    if (!resRows.length) return; // conflict — already exists

    // Send push
    await sendToAll({
      title: "Tomorrow's Lunch",
      body: `${meal.name} — ${meal.stock} portion${meal.stock !== 1 ? 's' : ''} in freezer. Time to defrost?`,
      url: '/',
    });

    console.log(`[scheduler] Lunch prompt created for ${tomorrow}: ${meal.name}`);
  } catch (err) {
    console.error('[scheduler] Lunch prompt error:', err.message);
  }
}

/**
 * Evening job: checks tonight's dinner plan.
 * Creates a reservation + sends "what happened?" push.
 */
async function runDinnerPrompt() {
  try {
    const today = localDateStr();
    const dow = dayOfWeek(today);

    // Check schedule
    const { rows: schedRows } = await pool.query(
      'SELECT dinner_enabled FROM schedule WHERE day_of_week = $1', [dow]
    );
    if (!schedRows[0]?.dinner_enabled) return;

    // Check for override
    const weekStart = addDays(today, -dow);
    const { rows: overrideRows } = await pool.query(
      `SELECT override_type FROM schedule_overrides
       WHERE week_start = $1 AND day_of_week = $2 AND meal_type = 'dinner'`,
      [weekStart, dow]
    );
    if (overrideRows[0]?.override_type === 'disabled') return;

    // Skip if reservation already exists for tonight dinner
    const { rows: existing } = await pool.query(
      `SELECT id FROM reservations WHERE meal_plan_date = $1 AND meal_type = 'dinner' AND status = 'pending'`,
      [today]
    );
    if (existing.length) return;

    // Fetch Mealie plan for today
    let planEntries = [];
    try {
      planEntries = await mealieSync.getMealPlan(today, today);
    } catch {
      return;
    }

    const dinnerEntry = planEntries.find(e => (e.entry_type || e.entryType || '').toLowerCase() === 'dinner');
    if (!dinnerEntry?.recipe?.slug) return;

    const slug = dinnerEntry.recipe.slug;

    // Find PrepTrack meal + freezer stock (stock informs push body)
    const { rows: mealRows } = await pool.query(
      `SELECT m.id, m.name, COALESCE(SUM(b.portions_remaining), 0)::int AS stock
       FROM meals m
       LEFT JOIN batches b ON b.meal_id = m.id AND b.portions_remaining > 0
       WHERE m.mealie_recipe_slug = $1
       GROUP BY m.id`,
      [slug]
    );
    const meal = mealRows[0];
    if (!meal) return;

    // Create reservation
    const { rows: resRows } = await pool.query(
      `INSERT INTO reservations (meal_id, meal_plan_date, meal_type)
       VALUES ($1, $2, 'dinner')
       ON CONFLICT (meal_plan_date, meal_type) DO NOTHING
       RETURNING id`,
      [meal.id, today]
    );
    if (!resRows.length) return;

    // Send push — mention freezer stock so user knows if "Used from Freezer" is relevant
    const stockNote = meal.stock > 0
      ? ` (${meal.stock} portion${meal.stock !== 1 ? 's' : ''} in freezer)`
      : '';
    await sendToAll({
      title: "Tonight's Dinner",
      body: `${meal.name}${stockNote} — what happened? Log it to keep your inventory accurate.`,
      url: '/',
    });

    console.log(`[scheduler] Dinner prompt created for ${today}: ${meal.name}`);
  } catch (err) {
    console.error('[scheduler] Dinner prompt error:', err.message);
  }
}

/**
 * Parse "HH:MM" time string into a cron expression "M H * * *".
 * NOTE: cron jobs run in the server process timezone. Ensure TZ is set correctly
 * in the deployment environment (e.g. TZ=Europe/London in .env or systemd unit).
 */
function timeToCron(timeStr) {
  const [h, m] = (timeStr || '').split(':').map(Number);
  const validH = Number.isFinite(h) && h >= 0 && h <= 23;
  const validM = Number.isFinite(m) && m >= 0 && m <= 59;
  if (!validH || !validM) {
    console.warn(`[scheduler] Invalid time "${timeStr}", falling back to 15:00/20:00 default`);
  }
  const hour   = validH ? h : 15;
  const minute = validM ? m : 0;
  return `${minute} ${hour} * * *`;
}

// Active cron tasks — kept so they can be destroyed on reschedule
let lunchTask  = null;
let dinnerTask = null;

/**
 * Schedule (or reschedule) cron jobs from the given time strings.
 * Destroys existing tasks before creating new ones.
 */
function scheduleJobs(lunchTime, dinnerTime) {
  if (lunchTask)  { lunchTask.stop();  lunchTask  = null; }
  if (dinnerTask) { dinnerTask.stop(); dinnerTask = null; }

  lunchTask  = cron.schedule(timeToCron(lunchTime),  runLunchPrompt);
  dinnerTask = cron.schedule(timeToCron(dinnerTime), runDinnerPrompt);

  console.log(`[scheduler] Scheduled — lunch at ${lunchTime}, dinner at ${dinnerTime}`);
}

/**
 * Start the scheduler. Called once at server startup.
 * Reads prompt times from DB settings; falls back to defaults.
 */
async function start() {
  try {
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('lunch_prompt_time', 'dinner_prompt_time')"
    );
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    scheduleJobs(map.lunch_prompt_time || '15:00', map.dinner_prompt_time || '20:00');
  } catch (err) {
    console.error('[scheduler] Failed to start:', err.message);
  }
}

/**
 * Reschedule cron jobs after prompt times are changed in Settings.
 * Reads fresh values from DB — call after saving new times.
 */
async function reschedule() {
  try {
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('lunch_prompt_time', 'dinner_prompt_time')"
    );
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    scheduleJobs(map.lunch_prompt_time || '15:00', map.dinner_prompt_time || '20:00');
  } catch (err) {
    console.error('[scheduler] Failed to reschedule:', err.message);
  }
}

module.exports = { start, reschedule, runLunchPrompt, runDinnerPrompt };
