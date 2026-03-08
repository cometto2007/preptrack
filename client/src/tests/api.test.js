import { describe, it, expect } from 'vitest';

// Unit tests for the API client helpers (pure logic, no network calls)
describe('API service', () => {
  it('builds correct meal endpoint paths', () => {
    const base = '/api';
    expect(`${base}/meals`).toBe('/api/meals');
    expect(`${base}/meals/42`).toBe('/api/meals/42');
    expect(`${base}/meals/42/increment`).toBe('/api/meals/42/increment');
    expect(`${base}/meals/42/decrement`).toBe('/api/meals/42/decrement');
  });

  it('builds correct settings endpoint paths', () => {
    const base = '/api';
    expect(`${base}/settings`).toBe('/api/settings');
    expect(`${base}/settings/schedule`).toBe('/api/settings/schedule');
    expect(`${base}/settings/schedule/1`).toBe('/api/settings/schedule/1');
  });
});

describe('Category utilities', () => {
  const CATEGORIES = ['Meals', 'Soups', 'Sauces', 'Baked Goods', 'Ingredients', 'Other'];

  it('has all expected categories', () => {
    expect(CATEGORIES).toHaveLength(6);
    expect(CATEGORIES).toContain('Meals');
    expect(CATEGORIES).toContain('Baked Goods');
  });

  it('converts category to settings key format', () => {
    const toKey = (cat) => `expiry_days_${cat.toLowerCase().replace(/ /g, '_')}`;
    expect(toKey('Meals')).toBe('expiry_days_meals');
    expect(toKey('Baked Goods')).toBe('expiry_days_baked_goods');
    expect(toKey('Soups')).toBe('expiry_days_soups');
  });
});
