// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
