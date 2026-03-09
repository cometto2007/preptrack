const cron = require('node-cron');
const pool = require('../db/connection');
const mealieSync = require('./mealieSync');
const { groupMealPlanEntries } = mealieSync;
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
 * Creates one reservation per recipe in the grouped meal + sends push.
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
    const weekStart = addDays(tomorrow, -dow);
    const { rows: overrideRows } = await pool.query(
      `SELECT override_type FROM schedule_overrides
       WHERE week_start = $1 AND day_of_week = $2 AND meal_type = 'lunch'`,
      [weekStart, dow]
    );
    if (overrideRows[0]?.override_type === 'disabled') return;

    // Skip if any reservations already exist for tomorrow lunch
    const { rows: existing } = await pool.query(
      `SELECT id FROM reservations WHERE meal_plan_date = $1 AND meal_type = 'lunch' AND status = 'pending'`,
      [tomorrow]
    );
    if (existing.length) return;

    // Fetch Mealie plan and group entries for tomorrow
    let planEntries = [];
    try {
      planEntries = await mealieSync.getMealPlan(tomorrow, tomorrow);
    } catch {
      return; // Mealie not configured or unreachable — skip
    }

    const groups = groupMealPlanEntries(planEntries);
    const lunchGroup = groups.find(g => g.mealType === 'lunch');
    if (!lunchGroup || lunchGroup.recipes.length === 0) return;

    // For each recipe, find the PrepTrack meal and create a reservation
    const reservedNames = [];
    let anyStocked = false;

    for (const recipe of lunchGroup.recipes) {
      const { rows: mealRows } = await pool.query(
        `SELECT m.id, m.name, COALESCE(SUM(b.portions_remaining), 0)::int AS stock
         FROM meals m
         LEFT JOIN batches b ON b.meal_id = m.id AND b.portions_remaining > 0
         WHERE m.mealie_recipe_slug = $1
         GROUP BY m.id`,
        [recipe.slug]
      );
      const meal = mealRows[0];
      if (!meal) continue;

      const { rows: resRows } = await pool.query(
        `INSERT INTO reservations (meal_id, meal_plan_date, meal_type, planned_quantity)
         VALUES ($1, $2, 'lunch', $3)
         ON CONFLICT (meal_plan_date, meal_type, meal_id) DO NOTHING
         RETURNING id`,
        [meal.id, tomorrow, recipe.quantity]
      );
      if (!resRows.length) continue; // conflict — already exists

      reservedNames.push(meal.name);
      if (meal.stock > 0) anyStocked = true;
    }

    if (reservedNames.length === 0) return;
    if (!anyStocked) return; // nothing to defrost

    const mealList = reservedNames.join(' + ');
    await sendToAll({
      title: "Tomorrow's Lunch",
      body: `${mealList} — time to defrost?`,
      url: '/',
    });

    console.log(`[scheduler] Lunch prompt created for ${tomorrow}: ${mealList}`);
  } catch (err) {
    console.error('[scheduler] Lunch prompt error:', err.message);
  }
}

/**
 * Evening job: checks tonight's dinner plan.
 * Creates one reservation per recipe in the grouped meal + sends push.
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

    // Skip if any reservations already exist for tonight dinner
    const { rows: existing } = await pool.query(
      `SELECT id FROM reservations WHERE meal_plan_date = $1 AND meal_type = 'dinner' AND status = 'pending'`,
      [today]
    );
    if (existing.length) return;

    // Fetch Mealie plan and group entries for today
    let planEntries = [];
    try {
      planEntries = await mealieSync.getMealPlan(today, today);
    } catch {
      return;
    }

    const groups = groupMealPlanEntries(planEntries);
    const dinnerGroup = groups.find(g => g.mealType === 'dinner');
    if (!dinnerGroup || dinnerGroup.recipes.length === 0) return;

    const reservedNames = [];
    let anyStocked = false;

    for (const recipe of dinnerGroup.recipes) {
      const { rows: mealRows } = await pool.query(
        `SELECT m.id, m.name, COALESCE(SUM(b.portions_remaining), 0)::int AS stock
         FROM meals m
         LEFT JOIN batches b ON b.meal_id = m.id AND b.portions_remaining > 0
         WHERE m.mealie_recipe_slug = $1
         GROUP BY m.id`,
        [recipe.slug]
      );
      const meal = mealRows[0];
      if (!meal) continue;

      const { rows: resRows } = await pool.query(
        `INSERT INTO reservations (meal_id, meal_plan_date, meal_type, planned_quantity)
         VALUES ($1, $2, 'dinner', $3)
         ON CONFLICT (meal_plan_date, meal_type, meal_id) DO NOTHING
         RETURNING id`,
        [meal.id, today, recipe.quantity]
      );
      if (!resRows.length) continue;

      reservedNames.push(meal.name);
      if (meal.stock > 0) anyStocked = true;
    }

    if (reservedNames.length === 0) return;

    const mealList = reservedNames.join(' + ');
    const stockNote = anyStocked ? '' : ' (no freezer stock)';
    await sendToAll({
      title: "Tonight's Dinner",
      body: `${mealList}${stockNote} — what happened? Log it to keep your inventory accurate.`,
      url: '/',
    });

    console.log(`[scheduler] Dinner prompt created for ${today}: ${mealList}`);
  } catch (err) {
    console.error('[scheduler] Dinner prompt error:', err.message);
  }
}

/**
 * Parse "HH:MM" time string into a cron expression "M H * * *".
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

let lunchTask  = null;
let dinnerTask = null;

function scheduleJobs(lunchTime, dinnerTime) {
  if (lunchTask)  { lunchTask.stop();  lunchTask  = null; }
  if (dinnerTask) { dinnerTask.stop(); dinnerTask = null; }

  lunchTask  = cron.schedule(timeToCron(lunchTime),  runLunchPrompt);
  dinnerTask = cron.schedule(timeToCron(dinnerTime), runDinnerPrompt);

  console.log(`[scheduler] Scheduled — lunch at ${lunchTime}, dinner at ${dinnerTime}`);
}

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
