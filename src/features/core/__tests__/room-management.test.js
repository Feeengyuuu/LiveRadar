// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const appState = {
        rooms: [],
        cache: {},
        searchHistory: []
    };

    return {
        appState,
        getElement: vi.fn((id) => document.getElementById(id)),
        isMobile: vi.fn(() => false),
        updateSearchHistory: vi.fn((history) => {
            appState.searchHistory = history;
        }),
        updateRoomDataCache: vi.fn((cache) => {
            appState.cache = cache;
        }),
        addRoomToState: vi.fn(),
        removeRoomFromState: vi.fn(),
        toggleRoomFavorite: vi.fn(),
        fetchRoomStatus: vi.fn(),
        cancelPendingFetches: vi.fn(),
        emit: vi.fn(),
        showToast: vi.fn()
    };
});

vi.mock('../../../utils/dom-cache.js', () => ({
    getElement: mocks.getElement
}));

vi.mock('../../../utils/device-detector.js', () => ({
    DeviceDetector: {
        isMobile: mocks.isMobile
    }
}));

vi.mock('../../../config/ui-strings.js', () => ({
    PLACEHOLDERS: {}
}));

vi.mock('../../../core/state.js', () => ({
    getRooms: () => mocks.appState.rooms,
    getRoomDataCache: () => mocks.appState.cache,
    getSearchHistory: () => mocks.appState.searchHistory,
    updateSearchHistory: mocks.updateSearchHistory,
    updateRoomDataCache: mocks.updateRoomDataCache,
    addRoom: mocks.addRoomToState,
    removeRoom: mocks.removeRoomFromState,
    toggleRoomFavorite: mocks.toggleRoomFavorite
}));

vi.mock('../../../utils/helpers.js', () => ({
    getRoomCacheKey: (platform, id) => `${platform}-${id}`,
    normalizeRoomId: (_, id) => id,
    showToast: mocks.showToast
}));

vi.mock('../../../core/status-fetcher.js', () => ({
    fetchRoomStatus: mocks.fetchRoomStatus,
    cancelPendingFetches: mocks.cancelPendingFetches
}));

vi.mock('../../../core/event-bus.js', () => ({
    emit: mocks.emit,
    Events: {
        RENDER_REQUEST: 'render:request'
    }
}));

const {
    deleteHistory,
    renderHistory,
    saveSearchHistory
} = await import('../room-management.js');

describe('room-management history', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div>
                <input id="room-id-input" />
                <div id="history-dropdown"></div>
            </div>
        `;
        Object.defineProperty(document.getElementById('history-dropdown'), 'offsetParent', {
            configurable: true,
            value: document.body
        });

        mocks.appState.searchHistory = [];
        vi.clearAllMocks();
    });

    it('saves history through centralized state with dedupe and max length', () => {
        mocks.appState.searchHistory = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];

        saveSearchHistory('gamma');
        expect(mocks.appState.searchHistory).toEqual(['gamma', 'alpha', 'beta', 'delta', 'epsilon']);

        saveSearchHistory('zeta');
        expect(mocks.appState.searchHistory).toEqual(['zeta', 'gamma', 'alpha', 'beta', 'delta']);
    });

    it('renders from the latest centralized history state instead of a stale module copy', () => {
        mocks.appState.searchHistory = ['alpha', 'beta'];
        renderHistory('be');
        expect(document.getElementById('history-dropdown').textContent).toContain('beta');

        mocks.appState.searchHistory = ['zeta'];
        renderHistory('ze');

        expect(document.getElementById('history-dropdown').textContent).toContain('zeta');
        expect(document.getElementById('history-dropdown').textContent).not.toContain('beta');
    });

    it('renders history rows as keyboard-accessible options with delete buttons', () => {
        mocks.appState.searchHistory = ['alpha'];
        renderHistory();

        const item = document.querySelector('.history-item');
        const deleteButton = document.querySelector('.history-delete');

        expect(item.getAttribute('role')).toBe('option');
        expect(item.tabIndex).toBe(0);
        expect(deleteButton.tagName).toBe('BUTTON');
        expect(deleteButton.type).toBe('button');
        expect(deleteButton.getAttribute('aria-label')).toContain('alpha');
    });

    it('deletes history items and keeps the input focused', () => {
        mocks.appState.searchHistory = ['one', 'two'];
        renderHistory();

        const stopPropagation = vi.fn();
        deleteHistory({ stopPropagation }, 'one');

        expect(stopPropagation).toHaveBeenCalledTimes(1);
        expect(mocks.appState.searchHistory).toEqual(['two']);
        expect(document.getElementById('history-dropdown').textContent).toContain('two');
        expect(document.activeElement).toBe(document.getElementById('room-id-input'));
    });
});
