// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    toggleAutoRefresh: vi.fn(),
    toggleSnow: vi.fn(),
    toggleDropdown: vi.fn(),
    selectPlatform: vi.fn(),
    closeDropdown: vi.fn(),
    showHistory: vi.fn(),
    hideHistory: vi.fn(),
    handleInput: vi.fn(),
    handleAddInput: vi.fn(),
    applyHistory: vi.fn(),
    deleteHistory: vi.fn(),
    removeRoom: vi.fn(),
    toggleFavorite: vi.fn(),
    getElement: vi.fn((id) => document.getElementById(id)),
    toggleNotifications: vi.fn(),
    unlockAllAudio: vi.fn(),
    exportRooms: vi.fn(),
    importRooms: vi.fn(),
    refreshAll: vi.fn(),
    playNotificationSound: vi.fn(),
    getRooms: vi.fn(() => []),
}));

vi.mock('../../features/enhancements/snow-effect-loader.js', () => ({
    toggleSnow: mocks.toggleSnow,
}));

vi.mock('../../features/core/room-management.js', () => ({
    toggleDropdown: mocks.toggleDropdown,
    selectPlatform: mocks.selectPlatform,
    closeDropdown: mocks.closeDropdown,
    showHistory: mocks.showHistory,
    hideHistory: mocks.hideHistory,
    handleInput: mocks.handleInput,
    handleAddInput: mocks.handleAddInput,
    applyHistory: mocks.applyHistory,
    deleteHistory: mocks.deleteHistory,
    removeRoom: mocks.removeRoom,
    toggleFavorite: mocks.toggleFavorite,
}));

vi.mock('../../utils/dom-cache.js', () => ({
    getElement: mocks.getElement,
}));

vi.mock('../../features/core/notifications.js', () => ({
    toggleNotifications: mocks.toggleNotifications,
}));

vi.mock('../../features/core/auto-refresh.js', () => ({
    toggleAutoRefresh: mocks.toggleAutoRefresh,
}));

vi.mock('../../features/audio/audio-manager.js', () => ({
    unlockAllAudio: mocks.unlockAllAudio,
}));

vi.mock('../../features/core/import-export.js', () => ({
    exportRooms: mocks.exportRooms,
    importRooms: mocks.importRooms,
}));

vi.mock('../refresh-manager.js', () => ({
    refreshAll: mocks.refreshAll,
}));

vi.mock('../../features/audio/notification-audio.js', () => ({
    playNotificationSound: mocks.playNotificationSound,
}));

vi.mock('../state.js', () => ({
    getRooms: mocks.getRooms,
}));

const { initEventRouter } = await import('../event-router.js');

describe('event-router', () => {
    beforeEach(() => {
        const existingDispose = initEventRouter();
        existingDispose?.();
        document.body.innerHTML = '<button data-action="toggle-auto-refresh">toggle</button>';
        vi.clearAllMocks();
    });

    it('does not register duplicate handlers when initialized repeatedly', () => {
        const disposeFirst = initEventRouter();
        const disposeSecond = initEventRouter();

        document.querySelector('[data-action="toggle-auto-refresh"]').click();

        expect(disposeSecond).toBe(disposeFirst);
        expect(mocks.toggleAutoRefresh).toHaveBeenCalledTimes(1);

        disposeFirst();
        document.querySelector('[data-action="toggle-auto-refresh"]').click();

        expect(mocks.toggleAutoRefresh).toHaveBeenCalledTimes(1);
    });
});
