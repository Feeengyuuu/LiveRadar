// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../../config/constants.js';

const mocks = vi.hoisted(() => {
    const mockState = {
        rooms: [],
        cache: {}
    };

    return {
        mockState,
        registerDefaultAdapters: vi.fn(),
        fetchPlatformStatus: vi.fn(),
        fetchPlatformStatusesBatch: vi.fn(),
        fetchQuick: vi.fn(),
        emit: vi.fn(),
        updateRoomCache: vi.fn((key, data) => {
            mockState.cache[key] = data;
        })
    };
});

vi.mock('../state.js', () => ({
    getRoomDataCache: () => mocks.mockState.cache,
    getRooms: () => mocks.mockState.rooms,
    updateRoomCache: mocks.updateRoomCache
}));

vi.mock('../../api/platform-adapter.js', () => ({
    registerDefaultAdapters: mocks.registerDefaultAdapters,
    fetchPlatformStatus: mocks.fetchPlatformStatus,
    fetchPlatformStatusesBatch: mocks.fetchPlatformStatusesBatch
}));

vi.mock('../../api/proxy-manager.js', () => ({
    fetchQuick: mocks.fetchQuick
}));

vi.mock('../../utils/data-differ.js', () => ({
    DataDiffer: {
        compare: vi.fn(() => ({ changed: true, changes: ['title'] })),
        summarize: vi.fn(() => 'changed')
    }
}));

vi.mock('../event-bus.js', () => ({
    emit: mocks.emit,
    Events: {
        RENDER_REQUEST: 'render:request'
    }
}));

const {
    cancelPendingFetches,
    fetchRoomsStatusBatch,
    fetchRoomStatus,
    initStatusFetcher
} = await import('../status-fetcher.js');

describe('status-fetcher', () => {
    beforeEach(() => {
        mocks.mockState.rooms = [{ id: '100', platform: 'douyu', isFav: false }];
        mocks.mockState.cache = {};
        vi.clearAllMocks();
        initStatusFetcher({});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not write late results for rooms that were removed mid-request', async () => {
        let resolveFetch;
        mocks.fetchPlatformStatus.mockImplementation(() => new Promise(resolve => {
            resolveFetch = resolve;
        }));

        const pending = fetchRoomStatus({ id: '100', platform: 'douyu', isFav: false });

        mocks.mockState.rooms = [];
        resolveFetch({
            isLive: true,
            isReplay: false,
            title: 'still live',
            owner: 'streamer',
            cover: '',
            avatar: '',
            heatValue: 1200,
            isError: false,
            startTime: null
        });

        await pending;

        expect(mocks.updateRoomCache).not.toHaveBeenCalled();
    });

    it('still updates cache for tracked rooms', async () => {
        mocks.fetchPlatformStatus.mockResolvedValue({
            isLive: true,
            isReplay: false,
            title: 'online',
            owner: 'streamer',
            cover: 'https://example.com/cover.jpg',
            avatar: 'https://example.com/avatar.jpg',
            heatValue: 3456,
            isError: false,
            startTime: null
        });

        await fetchRoomStatus({ id: '100', platform: 'douyu', isFav: false });

        expect(mocks.updateRoomCache).toHaveBeenCalledTimes(1);
        expect(mocks.updateRoomCache.mock.calls[0][0]).toBe('douyu-100');
    });

    it('formats Picarto live counts as real viewers', async () => {
        const room = { id: 'artist', platform: 'picarto', isFav: false };
        mocks.mockState.rooms = [room];
        mocks.fetchPlatformStatus.mockResolvedValue({
            isLive: true,
            isReplay: false,
            title: 'Mock Picarto Live',
            owner: 'Mock Artist',
            cover: 'https://example.com/live.jpg',
            avatar: 'https://example.com/avatar.jpg',
            heatValue: 321,
            isError: false,
            startTime: null
        });

        await fetchRoomStatus(room);

        const updateData = mocks.updateRoomCache.mock.calls[0][1];
        expect(mocks.updateRoomCache.mock.calls[0][0]).toBe('picarto-artist');
        expect(updateData.viewers).toBe('在线 321人');
        expect(updateData.platform).toBe('picarto');
    });

    it('keeps SOOP counts in the shared live status format', async () => {
        const room = { id: 'somebj', platform: 'soop', isFav: false };
        mocks.mockState.rooms = [room];
        mocks.fetchPlatformStatus.mockResolvedValue({
            isLive: true,
            isReplay: false,
            title: 'SOOP Live',
            owner: 'SOOP Anchor',
            cover: 'https://liveimg.sooplive.com/m/123456789',
            avatar: '',
            heatValue: 77,
            isError: false,
            startTime: null
        });

        await fetchRoomStatus(room);

        const updateData = mocks.updateRoomCache.mock.calls[0][1];
        expect(mocks.updateRoomCache.mock.calls[0][0]).toBe('soop-somebj');
        expect(updateData.viewers).toBe('在线 77');
        expect(updateData.platform).toBe('soop');
    });

    it('keeps duplicate live cover URLs inside the current platform bucket', async () => {
        const room = { id: '100', platform: 'twitch', isFav: false };
        const interval = APP_CONFIG.CACHE.LIVE_IMAGE_REFRESH_INTERVALS.INTERNATIONAL;
        const bucketStart = 5666666 * interval;
        const now = bucketStart + 60 * 1000;
        const bucket = Math.floor(now / interval);
        const baseCover = 'https://example.com/live.jpg';
        const previousCover = `${baseCover}?t=${bucket}`;

        vi.spyOn(Date, 'now').mockReturnValue(now);
        mocks.mockState.rooms = [room];
        mocks.mockState.cache = {
            'twitch-100': {
                isLive: true,
                isReplay: false,
                title: 'online',
                owner: 'streamer',
                cover: previousCover,
                avatar: 'https://example.com/avatar.jpg',
                heatValue: 1000,
                isError: false,
                loading: false,
                lastCoverUpdate: bucketStart
            }
        };
        mocks.fetchPlatformStatus.mockResolvedValue({
            isLive: true,
            isReplay: false,
            title: 'online',
            owner: 'streamer',
            cover: baseCover,
            avatar: 'https://example.com/avatar.jpg',
            heatValue: 1000,
            isError: false,
            startTime: null
        });

        await fetchRoomStatus(room);

        const updateData = mocks.updateRoomCache.mock.calls[0][1];
        expect(updateData.cover).toBe(previousCover);
        expect(updateData.lastCoverUpdate).toBe(bucketStart);
    });

    it('updates live cover timestamps when the platform bucket changes', async () => {
        const room = { id: '100', platform: 'twitch', isFav: false };
        const interval = APP_CONFIG.CACHE.LIVE_IMAGE_REFRESH_INTERVALS.INTERNATIONAL;
        const bucketStart = 5666666 * interval;
        const now = bucketStart + 6 * 60 * 1000;
        const previousBucket = Math.floor(bucketStart / interval);
        const nextBucket = Math.floor(now / interval);
        const baseCover = 'https://example.com/live.jpg';

        vi.spyOn(Date, 'now').mockReturnValue(now);
        mocks.mockState.rooms = [room];
        mocks.mockState.cache = {
            'twitch-100': {
                isLive: true,
                isReplay: false,
                title: 'online',
                owner: 'streamer',
                cover: `${baseCover}?t=${previousBucket}`,
                avatar: 'https://example.com/avatar.jpg',
                heatValue: 1000,
                isError: false,
                loading: false,
                lastCoverUpdate: bucketStart
            }
        };
        mocks.fetchPlatformStatus.mockResolvedValue({
            isLive: true,
            isReplay: false,
            title: 'online',
            owner: 'streamer',
            cover: baseCover,
            avatar: 'https://example.com/avatar.jpg',
            heatValue: 1000,
            isError: false,
            startTime: null
        });

        await fetchRoomStatus(room);

        const updateData = mocks.updateRoomCache.mock.calls[0][1];
        expect(updateData.cover).toBe(`${baseCover}?t=${nextBucket}`);
        expect(updateData.lastCoverUpdate).toBe(now);
    });

    it('keeps the original in-flight request deduped when a room is re-added', async () => {
        let resolveFetch;
        const room = { id: '100', platform: 'douyu', isFav: false };

        mocks.fetchPlatformStatus.mockImplementation(() => new Promise(resolve => {
            resolveFetch = resolve;
        }));

        const first = fetchRoomStatus(room);

        mocks.mockState.rooms = [];
        cancelPendingFetches('douyu-100');
        mocks.mockState.rooms = [room];

        const second = fetchRoomStatus(room);

        expect(second).toBe(first);
        expect(mocks.fetchPlatformStatus).toHaveBeenCalledTimes(1);

        resolveFetch({
            isLive: true,
            isReplay: false,
            title: 're-added room',
            owner: 'streamer',
            cover: 'https://example.com/cover.jpg',
            avatar: 'https://example.com/avatar.jpg',
            heatValue: 1234,
            isError: false,
            startTime: null
        });

        await second;

        expect(mocks.updateRoomCache).toHaveBeenCalledTimes(1);
        expect(mocks.updateRoomCache.mock.calls[0][0]).toBe('douyu-100');
    });

    it('applies server batch results and falls back per missed room', async () => {
        const rooms = [
            { id: '100', platform: 'douyu', isFav: false },
            { id: '200', platform: 'bilibili', isFav: false }
        ];
        const progress = vi.fn();
        mocks.mockState.rooms = rooms;
        mocks.fetchPlatformStatusesBatch.mockResolvedValue([
            {
                isLive: true,
                isReplay: false,
                title: 'batch online',
                owner: 'batch streamer',
                cover: 'https://example.com/batch.jpg',
                avatar: 'https://example.com/batch-avatar.jpg',
                heatValue: 1000,
                isError: false,
                startTime: null
            },
            null
        ]);
        mocks.fetchPlatformStatus.mockResolvedValue({
            isLive: false,
            isReplay: false,
            title: 'fallback offline',
            owner: 'fallback streamer',
            cover: '',
            avatar: '',
            heatValue: 0,
            isError: false,
            startTime: null
        });

        await fetchRoomsStatusBatch(rooms, { onProgress: progress, fallbackConcurrency: 2 });

        expect(mocks.fetchPlatformStatusesBatch).toHaveBeenCalledTimes(1);
        expect(mocks.fetchPlatformStatus).toHaveBeenCalledTimes(1);
        expect(mocks.updateRoomCache).toHaveBeenCalledTimes(2);
        expect(mocks.updateRoomCache.mock.calls[0][0]).toBe('douyu-100');
        expect(mocks.updateRoomCache.mock.calls[1][0]).toBe('bilibili-200');
        expect(progress).toHaveBeenCalledTimes(2);
    });
});
