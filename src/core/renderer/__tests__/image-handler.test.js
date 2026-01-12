/**
 * Image Handler Tests
 * Testing smart image caching and URL generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSmartImageUrl } from '../image-handler.js';

describe('Image Handler - getSmartImageUrl', () => {
  beforeEach(() => {
    // Reset time mocking before each test
    vi.restoreAllMocks();
  });

  describe('Offline/Replay Content (no timestamp)', () => {
    it('should return original URL for offline content', () => {
      const url = 'https://example.com/cover.jpg';
      const result = getSmartImageUrl(url, 'douyu', false);
      expect(result).toBe(url);
    });

    it('should return original URL when isLive is false', () => {
      const url = 'https://example.com/cover.jpg';
      const result = getSmartImageUrl(url, 'twitch', false);
      expect(result).toBe(url);
    });

    it('should return empty string when no URL provided', () => {
      const result = getSmartImageUrl('', 'douyu', true);
      expect(result).toBe('');
    });
  });

  describe('Live Content - International Platforms (5min buckets)', () => {
    it('should add 5-minute timestamp bucket for Twitch', () => {
      const now = 1700000000000; // Mock timestamp
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const url = 'https://twitch.tv/cover.jpg';
      const result = getSmartImageUrl(url, 'twitch', true);

      const expected5MinBucket = Math.floor(now / (5 * 60 * 1000));
      expect(result).toBe(`${url}?t=${expected5MinBucket}`);
    });

    it('should add 5-minute timestamp bucket for Kick', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const url = 'https://kick.com/cover.jpg';
      const result = getSmartImageUrl(url, 'kick', true);

      const expected5MinBucket = Math.floor(now / (5 * 60 * 1000));
      expect(result).toBe(`${url}?t=${expected5MinBucket}`);
    });

    it('should use & for URL with existing query params', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const url = 'https://twitch.tv/cover.jpg?quality=high';
      const result = getSmartImageUrl(url, 'twitch', true);

      const expected5MinBucket = Math.floor(now / (5 * 60 * 1000));
      expect(result).toBe(`${url}&t=${expected5MinBucket}`);
    });
  });

  describe('Live Content - Domestic Platforms (10min buckets)', () => {
    it('should add 10-minute timestamp bucket for Douyu', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const url = 'https://douyu.com/cover.jpg';
      const result = getSmartImageUrl(url, 'douyu', true);

      const expected10MinBucket = Math.floor(now / (10 * 60 * 1000));
      expect(result).toBe(`${url}?t=${expected10MinBucket}`);
    });

    it('should add 10-minute timestamp bucket for Bilibili', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const url = 'https://bilibili.com/cover.jpg';
      const result = getSmartImageUrl(url, 'bilibili', true);

      const expected10MinBucket = Math.floor(now / (10 * 60 * 1000));
      expect(result).toBe(`${url}?t=${expected10MinBucket}`);
    });
  });

  describe('Cache Bucket Behavior', () => {
    it('should return same URL within 5-minute window (Twitch)', () => {
      const baseUrl = 'https://twitch.tv/cover.jpg';

      // Use a round bucket boundary (5666666 * 5min = 1699999800000)
      const bucketStart = 5666666 * 5 * 60 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(bucketStart);
      const result1 = getSmartImageUrl(baseUrl, 'twitch', true);

      // Time 4 minutes later (still in same bucket)
      const time4MinLater = bucketStart + 4 * 60 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(time4MinLater);
      const result2 = getSmartImageUrl(baseUrl, 'twitch', true);

      expect(result1).toBe(result2);
    });

    it('should return different URL after 5-minute window (Twitch)', () => {
      const baseUrl = 'https://twitch.tv/cover.jpg';

      // Time at start of 5-min bucket
      const bucketStart = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(bucketStart);
      const result1 = getSmartImageUrl(baseUrl, 'twitch', true);

      // Time 6 minutes later (next bucket)
      vi.spyOn(Date, 'now').mockReturnValue(bucketStart + 6 * 60 * 1000);
      const result2 = getSmartImageUrl(baseUrl, 'twitch', true);

      expect(result1).not.toBe(result2);
    });

    it('should return same URL within 10-minute window (Douyu)', () => {
      const baseUrl = 'https://douyu.com/cover.jpg';

      // Use a round bucket boundary (2833333 * 10min = 1699999800000)
      const bucketStart = 2833333 * 10 * 60 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(bucketStart);
      const result1 = getSmartImageUrl(baseUrl, 'douyu', true);

      // Time 9 minutes later (still in same bucket)
      const time9MinLater = bucketStart + 9 * 60 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(time9MinLater);
      const result2 = getSmartImageUrl(baseUrl, 'douyu', true);

      expect(result1).toBe(result2);
    });
  });

  describe('Edge Cases', () => {
    it('should not modify URL that already has timestamp parameter', () => {
      const urlWithTimestamp = 'https://example.com/cover.jpg?t=123456';
      const result = getSmartImageUrl(urlWithTimestamp, 'twitch', true);
      expect(result).toBe(urlWithTimestamp);
    });

    it('should not modify URL with timestamp in middle of query string', () => {
      const urlWithTimestamp = 'https://example.com/cover.jpg?foo=bar&t=123&baz=qux';
      const result = getSmartImageUrl(urlWithTimestamp, 'douyu', true);
      expect(result).toBe(urlWithTimestamp);
    });
  });
});
