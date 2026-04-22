// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const appState = {
        previousLiveStatus: {}
    };

    return {
        appState,
        getElement: vi.fn((id) => document.getElementById(id)),
        updatePreviousLiveStatus: vi.fn((next) => {
            appState.previousLiveStatus = next;
        })
    };
});

vi.mock('../../../core/state.js', () => ({
    getState: () => mocks.appState,
    updatePreviousLiveStatus: mocks.updatePreviousLiveStatus
}));

vi.mock('../../../utils/dom-cache.js', () => ({
    getElement: mocks.getElement
}));

const {
    clearTickerState,
    detectStatusChanges,
    initStatusTicker
} = await import('../status-ticker.js');

describe('status-ticker DOM reuse', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="status-ticker"></div>';
        mocks.appState.previousLiveStatus = {};
        vi.clearAllMocks();
        initStatusTicker();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('reattaches the reusable ticker node after the ticker is cleared', () => {
        const rooms = [{ id: '77', platform: 'douyu', isFav: false }];
        const cache = {
            'douyu-77': {
                isLive: true,
                owner: '主播A',
                loading: false,
                isError: false,
                _stale: false
            }
        };

        detectStatusChanges(rooms, cache);
        vi.advanceTimersByTime(150);

        const ticker = document.getElementById('status-ticker');
        expect(ticker.children.length).toBe(1);

        clearTickerState();
        expect(ticker.children.length).toBe(0);

        detectStatusChanges(rooms, cache);
        vi.advanceTimersByTime(150);

        expect(ticker.children.length).toBe(1);
        expect(ticker.textContent).toContain('主播A');
    });
});
