// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const appState = {
        autoRefreshEnabled: false
    };

    return {
        appState,
        getElement: vi.fn((id) => document.getElementById(id)),
        updateAutoRefreshEnabled: vi.fn((enabled) => {
            appState.autoRefreshEnabled = enabled;
        }),
        addInterval: vi.fn((timerId) => timerId),
        clearManagedInterval: vi.fn((timerId) => clearInterval(timerId)),
        on: vi.fn(),
        emit: vi.fn(),
        showToast: vi.fn()
    };
});

vi.mock('../../../core/state.js', () => ({
    isAutoRefreshEnabled: () => mocks.appState.autoRefreshEnabled,
    updateAutoRefreshEnabled: mocks.updateAutoRefreshEnabled
}));

vi.mock('../../../utils/dom-cache.js', () => ({
    getElement: mocks.getElement
}));

vi.mock('../../../utils/resource-manager.js', () => ({
    ResourceManager: {
        addInterval: mocks.addInterval,
        clearInterval: mocks.clearManagedInterval
    }
}));

vi.mock('../../../core/event-bus.js', () => ({
    on: mocks.on,
    emit: mocks.emit,
    Events: {
        AUTO_REFRESH_RESET: 'auto:reset',
        AUTO_REFRESH_UPDATE_BTN: 'auto:update-btn',
        REFRESH_REQUEST: 'refresh:request'
    }
}));

vi.mock('../../../utils/helpers.js', () => ({
    showToast: mocks.showToast
}));

const {
    initAutoRefresh,
    resetAutoRefreshCountdown,
    startAutoRefresh,
    stopAutoRefresh,
    toggleAutoRefresh
} = await import('../auto-refresh.js');

describe('auto-refresh', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <button id="auto-refresh-btn" class="auto-refresh-btn off">
                <span id="auto-refresh-label">自动: 关</span>
            </button>
        `;

        mocks.appState.autoRefreshEnabled = false;
        vi.clearAllMocks();
    });

    afterEach(() => {
        stopAutoRefresh();
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('initializes button state from centralized app state', () => {
        mocks.appState.autoRefreshEnabled = true;

        initAutoRefresh();

        expect(document.getElementById('auto-refresh-btn').classList.contains('off')).toBe(false);
        expect(document.getElementById('auto-refresh-label').textContent).toBe('自动: 10:00');
    });

    it('toggles persisted state and updates the button label', () => {
        toggleAutoRefresh();

        expect(mocks.updateAutoRefreshEnabled).toHaveBeenCalledWith(true);
        expect(document.getElementById('auto-refresh-label').textContent).toBe('自动: 10:00');
        expect(mocks.showToast).toHaveBeenCalledWith('自动刷新已开启 (每10分钟)');

        toggleAutoRefresh();

        expect(mocks.updateAutoRefreshEnabled).toHaveBeenLastCalledWith(false);
        expect(document.getElementById('auto-refresh-label').textContent).toBe('自动: 关');
        expect(mocks.showToast).toHaveBeenLastCalledWith('自动刷新已关闭');
    });

    it('resets the countdown after manual refresh events', () => {
        mocks.appState.autoRefreshEnabled = true;
        startAutoRefresh();
        vi.advanceTimersByTime(3000);

        resetAutoRefreshCountdown();

        expect(document.getElementById('auto-refresh-label').textContent).toBe('自动: 10:00');
    });

    it('emits a refresh request when the countdown reaches zero', () => {
        startAutoRefresh();

        vi.advanceTimersByTime(600000);

        expect(mocks.emit).toHaveBeenCalledWith('refresh:request', false, true);
    });
});
