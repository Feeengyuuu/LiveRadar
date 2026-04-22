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
    fetchPlatformStatus: mocks.fetchPlatformStatus
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
});
