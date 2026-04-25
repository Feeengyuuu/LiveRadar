// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    state: {
        rooms: [],
        cache: {}
    },
    domCache: {},
    subscribeToState: vi.fn(),
    on: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn(),
    createCard: vi.fn((cardId) => {
        const card = document.createElement('a');
        card.className = 'room-card';
        card.id = cardId;
        return card;
    }),
    updateCard: vi.fn()
}));

vi.mock('../../state.js', () => ({
    getRooms: () => mocks.state.rooms,
    getRoomDataCache: () => mocks.state.cache,
    subscribeToState: mocks.subscribeToState
}));

vi.mock('../../../utils/dom-cache.js', () => ({
    getDOMCache: () => mocks.domCache
}));

vi.mock('../../../utils/viewport-tracker.js', () => ({
    viewportTracker: {
        observe: mocks.observe,
        unobserve: mocks.unobserve
    }
}));

vi.mock('../../event-bus.js', () => ({
    on: mocks.on,
    Events: {
        RENDER_REQUEST: 'render:request'
    }
}));

vi.mock('../card-factory.js', () => ({
    createCard: mocks.createCard
}));

vi.mock('../card-renderer.js', () => ({
    updateCard: mocks.updateCard
}));

const { renderAll } = await import('../grid-manager.js');

describe('grid-manager empty-state cleanup', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="empty-state" class="hidden"></div>
            <div id="zone-live"></div>
            <div id="zone-offline"></div>
            <div id="zone-loop"></div>
            <div id="grid-live"></div>
            <div id="grid-offline"></div>
            <div id="grid-loop"></div>
            <span id="live-count"></span>
            <span id="metric-live-count"></span>
            <span id="metric-offline-count"></span>
            <span id="metric-favorite-count"></span>
        `;

        mocks.domCache = {
            emptyState: document.getElementById('empty-state'),
            zoneLive: document.getElementById('zone-live'),
            zoneOffline: document.getElementById('zone-offline'),
            zoneLoop: document.getElementById('zone-loop'),
            gridLive: document.getElementById('grid-live'),
            gridOffline: document.getElementById('grid-offline'),
            gridLoop: document.getElementById('grid-loop'),
            liveCount: document.getElementById('live-count'),
            metricLiveCount: document.getElementById('metric-live-count'),
            metricOfflineCount: document.getElementById('metric-offline-count'),
            metricFavoriteCount: document.getElementById('metric-favorite-count')
        };

        mocks.state.rooms = [{ id: '1', platform: 'douyu', isFav: false }];
        mocks.state.cache = {
            'douyu-1': {
                loading: false,
                isLive: false,
                isReplay: false,
                isError: false
            }
        };

        vi.clearAllMocks();
    });

    it('unobserves rendered cards when transitioning to an empty state', () => {
        renderAll();
        expect(mocks.domCache.gridOffline.children.length).toBe(1);

        mocks.state.rooms = [];
        renderAll();

        expect(mocks.unobserve).toHaveBeenCalledTimes(1);
        expect(mocks.domCache.gridOffline.children.length).toBe(0);
        expect(mocks.domCache.emptyState.classList.contains('hidden')).toBe(false);
    });

    it('counts only live favorite rooms in the favorite metric', () => {
        mocks.state.rooms = [
            { id: 'live-fav', platform: 'douyu', isFav: true },
            { id: 'offline-fav', platform: 'douyu', isFav: true },
            { id: 'live-other', platform: 'douyu', isFav: false }
        ];
        mocks.state.cache = {
            'douyu-live-fav': {
                loading: false,
                isLive: true,
                isReplay: false,
                isError: false
            },
            'douyu-offline-fav': {
                loading: false,
                isLive: false,
                isReplay: false,
                isError: false
            },
            'douyu-live-other': {
                loading: false,
                isLive: true,
                isReplay: false,
                isError: false
            }
        };

        renderAll();

        expect(mocks.domCache.metricLiveCount.textContent).toBe('2');
        expect(mocks.domCache.metricFavoriteCount.textContent).toBe('1');
    });
});
