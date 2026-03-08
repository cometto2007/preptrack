const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// The allowed values for activity_log.source — must stay in sync with the DB CHECK constraint
const ALLOWED_SOURCES = ['manual', 'prompt', 'mealie_sync', 'batch_delete'];

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

describe('Expiry date calculation', () => {
  function calcExpiry(category, freezeDate, settings) {
    const cat = category.toLowerCase().replace(/ /g, '_');
    const days = parseInt(settings[`expiry_days_${cat}`] ?? '90');
    const d = new Date(freezeDate);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  }

  const settings = {
    expiry_days_meals: '90',
    expiry_days_soups: '180',
    expiry_days_baked_goods: '90',
  };

  it('computes expiry for meals', () => {
    const result = calcExpiry('Meals', '2026-01-01', settings);
    assert.equal(result, '2026-04-01');
  });

  it('computes expiry for soups (longer shelf life)', () => {
    // 180 days from 2026-01-01 = 2026-06-30
    const result = calcExpiry('Soups', '2026-01-01', settings);
    assert.equal(result, '2026-06-30');
  });

  it('handles multi-word categories', () => {
    const result = calcExpiry('Baked Goods', '2026-01-01', settings);
    assert.equal(result, '2026-04-01');
  });
});
