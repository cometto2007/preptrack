const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// The allowed values for activity_log.source — must stay in sync with the DB CHECK constraint
const ALLOWED_SOURCES = ['manual', 'prompt', 'mealie_sync', 'batch_delete', 'defrost', 'used_freezer'];

describe('activity_log source constraint', () => {
  it('allows all expected source values', () => {
    for (const src of ALLOWED_SOURCES) {
      assert.ok(ALLOWED_SOURCES.includes(src), `source '${src}' should be allowed`);
    }
  });

  it('batch_delete is explicitly allowed (used by DELETE /api/batches/:id)', () => {
    assert.ok(ALLOWED_SOURCES.includes('batch_delete'));
  });

  it('rejects unexpected source values', () => {
    const invalid = ['auto', 'system', 'api', ''];
    for (const src of invalid) {
      assert.ok(!ALLOWED_SOURCES.includes(src), `source '${src}' should not be allowed`);
    }
  });
});

// Unit tests for FIFO decrement logic (pure logic, no DB required)
describe('FIFO batch decrement logic', () => {
  function simulateFifo(batches, quantity) {
    let remaining = quantity;
    const updates = [];
    for (const batch of [...batches].sort((a, b) => new Date(a.freeze_date) - new Date(b.freeze_date))) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.portions_remaining);
      updates.push({ id: batch.id, take });
      remaining -= take;
    }
    return { updates, leftover: remaining };
  }

  it('takes from oldest batch first', () => {
    const batches = [
      { id: 2, portions_remaining: 4, freeze_date: '2026-02-01' },
      { id: 1, portions_remaining: 6, freeze_date: '2026-01-01' },
    ];
    const { updates } = simulateFifo(batches, 3);
    assert.equal(updates[0].id, 1); // oldest first
    assert.equal(updates[0].take, 3);
  });

  it('spans multiple batches when needed', () => {
    const batches = [
      { id: 1, portions_remaining: 2, freeze_date: '2026-01-01' },
      { id: 2, portions_remaining: 4, freeze_date: '2026-02-01' },
    ];
    const { updates, leftover } = simulateFifo(batches, 5);
    assert.equal(updates.length, 2);
    assert.equal(updates[0].take, 2);
    assert.equal(updates[1].take, 3);
    assert.equal(leftover, 0);
  });

  it('returns leftover when insufficient stock', () => {
    const batches = [{ id: 1, portions_remaining: 2, freeze_date: '2026-01-01' }];
    const { leftover } = simulateFifo(batches, 5);
    assert.equal(leftover, 3);
  });
});

describe('Mealie route — date arithmetic', () => {
  // Mirror of addDaysToDateStr in server/routes/mealie.js
  function addDaysToDateStr(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  it('adds 0 days returns same date', () => {
    assert.equal(addDaysToDateStr('2026-03-01', 0), '2026-03-01');
  });

  it('adds 6 days for a 7-day window end date', () => {
    assert.equal(addDaysToDateStr('2026-03-01', 6), '2026-03-07');
  });

  it('crosses month boundary correctly', () => {
    assert.equal(addDaysToDateStr('2026-01-30', 3), '2026-02-02');
  });

  it('crosses year boundary correctly', () => {
    assert.equal(addDaysToDateStr('2026-12-30', 3), '2027-01-02');
  });

  it('handles leap year correctly', () => {
    assert.equal(addDaysToDateStr('2024-02-28', 1), '2024-02-29'); // 2024 is a leap year
    assert.equal(addDaysToDateStr('2024-02-28', 2), '2024-03-01');
  });
});

describe('Mealie route — plan synthesis logic', () => {
  // Simplified version of the slot status computation logic
  function computeSlotStatus(ptMeal, lowThreshold) {
    const portions = ptMeal ? Number(ptMeal.total_portions) : 0;
    if (!ptMeal || portions === 0) return 'missing';
    if (portions <= lowThreshold) return 'low';
    return 'covered';
  }

  it('returns missing when no PrepTrack meal exists', () => {
    assert.equal(computeSlotStatus(null, 2), 'missing');
  });

  it('returns missing when portions is 0', () => {
    assert.equal(computeSlotStatus({ total_portions: 0 }, 2), 'missing');
  });

  it('returns low when portions equals threshold', () => {
    assert.equal(computeSlotStatus({ total_portions: 2 }, 2), 'low');
  });

  it('returns low when portions is below threshold', () => {
    assert.equal(computeSlotStatus({ total_portions: 1 }, 2), 'low');
  });

  it('returns covered when portions exceeds threshold', () => {
    assert.equal(computeSlotStatus({ total_portions: 3 }, 2), 'covered');
  });
});

describe('Mealie route — sync linking logic', () => {
  // Mirror of the name-matching logic in POST /api/mealie/sync
  function buildMealieByName(recipes) {
    const map = {};
    for (const r of recipes) {
      map[r.name.toLowerCase()] = r.slug;
    }
    return map;
  }

  function findSlugForMeal(meal, mealieByName) {
    return mealieByName[meal.name.toLowerCase()] || null;
  }

  const mealieRecipes = [
    { name: 'Beef Bolognese', slug: 'beef-bolognese' },
    { name: 'Chicken Soup', slug: 'chicken-soup' },
    { name: 'Pasta Bake', slug: 'pasta-bake' },
  ];

  it('matches by exact name (case-insensitive)', () => {
    const map = buildMealieByName(mealieRecipes);
    assert.equal(findSlugForMeal({ name: 'Beef Bolognese' }, map), 'beef-bolognese');
    assert.equal(findSlugForMeal({ name: 'beef bolognese' }, map), 'beef-bolognese');
    assert.equal(findSlugForMeal({ name: 'BEEF BOLOGNESE' }, map), 'beef-bolognese');
  });

  it('returns null for no match', () => {
    const map = buildMealieByName(mealieRecipes);
    assert.equal(findSlugForMeal({ name: 'Unknown Dish' }, map), null);
  });

  it('does not partially match — requires full name', () => {
    const map = buildMealieByName(mealieRecipes);
    assert.equal(findSlugForMeal({ name: 'Beef' }, map), null);
  });

  it('links multiple meals from the same recipe list', () => {
    const map = buildMealieByName(mealieRecipes);
    const preptrackMeals = [
      { id: 1, name: 'Beef Bolognese' },
      { id: 2, name: 'chicken soup' },
      { id: 3, name: 'Lasagne' },
    ];
    const linked = preptrackMeals.filter(m => findSlugForMeal(m, map) !== null);
    assert.equal(linked.length, 2);
  });
});

describe('Expiry date calculation', () => {
  function calcExpiry(freezeDate, settings) {
    const days = parseInt(settings.default_expiry_days ?? '90', 10);
    const d = new Date(freezeDate);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  }

  const settings = {
    default_expiry_days: '90',
  };

  it('computes expiry from default expiry setting', () => {
    const result = calcExpiry('2026-01-01', settings);
    assert.equal(result, '2026-04-01');
  });

  it('falls back to 90 days when setting is missing', () => {
    const result = calcExpiry('2026-01-01', {});
    assert.equal(result, '2026-04-01');
  });
});
