/**
 * Utility Helpers Tests
 * Testing number formatting and parsing functions
 */

import { describe, it, expect } from 'vitest';
import { formatHeat, parseHeatValue, debounce, getRoomCacheKey, getCardId } from '../helpers.js';

describe('Utility Helpers - Number Formatting', () => {
  describe('formatHeat', () => {
    it('should format numbers under 1000 as-is', () => {
      expect(formatHeat(0)).toBe('0');
      expect(formatHeat(1)).toBe('1');
      expect(formatHeat(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
      expect(formatHeat(1000)).toBe('1.0K');
      expect(formatHeat(1500)).toBe('1.5K');
      expect(formatHeat(9999)).toBe('10.0K');
    });

    it('should format ten-thousands with 万 suffix', () => {
      expect(formatHeat(10000)).toBe('1.0万');
      expect(formatHeat(50000)).toBe('5.0万');
      expect(formatHeat(123456)).toBe('12.3万');
    });

    it('should handle edge cases', () => {
      expect(formatHeat(null)).toBe('0');
      expect(formatHeat(undefined)).toBe('0');
      expect(formatHeat(-100)).toBe('0');
      expect(formatHeat(0)).toBe('0');
    });

    it('should round to 1 decimal place', () => {
      expect(formatHeat(1234)).toBe('1.2K');
      expect(formatHeat(12345)).toBe('1.2万');
    });
  });

  describe('parseHeatValue', () => {
    it('should parse numeric values', () => {
      expect(parseHeatValue(100)).toBe(100);
      expect(parseHeatValue(1234)).toBe(1234);
      expect(parseHeatValue(0)).toBe(0);
    });

    it('should parse string numbers', () => {
      expect(parseHeatValue('100')).toBe(100);
      expect(parseHeatValue('1234')).toBe(1234);
    });

    it('should parse Chinese unit 万 (ten-thousand)', () => {
      expect(parseHeatValue('1万')).toBe(10000);
      expect(parseHeatValue('5.5万')).toBe(55000);
      expect(parseHeatValue('12.3万')).toBe(123000);
    });

    it('should parse K unit (thousand)', () => {
      expect(parseHeatValue('1K')).toBe(1000);
      expect(parseHeatValue('5.5k')).toBe(5500);
      expect(parseHeatValue('10K')).toBe(10000);
    });

    it('should parse M unit (million)', () => {
      expect(parseHeatValue('1M')).toBe(1000000);
      expect(parseHeatValue('2.5m')).toBe(2500000);
    });

    it('should handle whitespace and commas', () => {
      expect(parseHeatValue('  1,234  ')).toBe(1234);
      expect(parseHeatValue('1,000K')).toBe(1000000);
      expect(parseHeatValue(' 5.5 万 ')).toBe(55000);
    });

    it('should handle edge cases', () => {
      expect(parseHeatValue(null)).toBe(0);
      expect(parseHeatValue(undefined)).toBe(0);
      expect(parseHeatValue('')).toBe(0);
      expect(parseHeatValue('invalid')).toBe(0);
      expect(parseHeatValue(Infinity)).toBe(0);
      expect(parseHeatValue(-100)).toBe(0); // Negative clamped to 0
    });

    it('should floor decimal results', () => {
      expect(parseHeatValue(123.7)).toBe(123);
      expect(parseHeatValue('123.9')).toBe(123);
    });
  });
});

describe('Utility Helpers - ID Generation', () => {
  describe('getRoomCacheKey', () => {
    it('should generate cache key from platform and id', () => {
      expect(getRoomCacheKey('douyu', '123456')).toBe('douyu-123456');
      expect(getRoomCacheKey('bilibili', '789')).toBe('bilibili-789');
      expect(getRoomCacheKey('twitch', 'ninja')).toBe('twitch-ninja');
    });

    it('should handle special characters in room id', () => {
      expect(getRoomCacheKey('kick', 'user_123')).toBe('kick-user_123');
    });
  });

  describe('getCardId', () => {
    it('should generate card DOM id from platform and room id', () => {
      expect(getCardId('douyu', '123456')).toBe('card-douyu-123456');
      expect(getCardId('bilibili', '789')).toBe('card-bilibili-789');
      expect(getCardId('twitch', 'ninja')).toBe('card-twitch-ninja');
    });
  });
});

describe('Utility Helpers - Debounce', () => {
  it('should create debounced function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    expect(typeof debounced).toBe('function');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should delay function execution', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should only execute once for multiple rapid calls', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    debounced();
    debounced();

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should execute again after delay period', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fn).toHaveBeenCalledTimes(1);

    debounced();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
