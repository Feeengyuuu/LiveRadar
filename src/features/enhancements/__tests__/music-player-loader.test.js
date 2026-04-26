// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    loadMusicPlayer,
    resetMusicPlayerLoaderForTests,
    scheduleMusicPlayerInit
} = await import('../music-player-loader.js');

describe('music-player-loader', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="music-player" hidden inert></div>';
        resetMusicPlayerLoaderForTests();
    });

    it('loads and initializes the music player module only once', async () => {
        const initMusicPlayer = vi.fn();
        const importer = vi.fn(async () => ({ initMusicPlayer }));

        await Promise.all([
            loadMusicPlayer(importer),
            loadMusicPlayer(importer),
        ]);

        expect(importer).toHaveBeenCalledTimes(1);
        expect(initMusicPlayer).toHaveBeenCalledTimes(1);
        expect(document.getElementById('music-player').hidden).toBe(false);
    });

    it('deduplicates scheduled initialization requests', async () => {
        const initMusicPlayer = vi.fn();
        const importer = vi.fn(async () => ({ initMusicPlayer }));
        const scheduledCallbacks = [];
        const scheduler = vi.fn((callback) => {
            scheduledCallbacks.push(callback);
        });

        scheduleMusicPlayerInit({ importer, scheduler });
        scheduleMusicPlayerInit({ importer, scheduler });

        expect(scheduler).toHaveBeenCalledTimes(1);
        expect(scheduledCallbacks).toHaveLength(1);
        expect(document.getElementById('music-player').hidden).toBe(true);

        scheduledCallbacks[0]();
        await Promise.resolve();

        expect(importer).toHaveBeenCalledTimes(1);
        expect(initMusicPlayer).toHaveBeenCalledTimes(1);
        expect(document.getElementById('music-player').hidden).toBe(false);
    });

    it('does not defer default initialization to an idle callback', async () => {
        vi.useFakeTimers();
        const originalIdleCallback = window.requestIdleCallback;
        window.requestIdleCallback = vi.fn();

        try {
            const initMusicPlayer = vi.fn();
            const importer = vi.fn(async () => ({ initMusicPlayer }));

            scheduleMusicPlayerInit({ importer });

            expect(window.requestIdleCallback).not.toHaveBeenCalled();
            expect(importer).not.toHaveBeenCalled();

            await vi.runOnlyPendingTimersAsync();
            await Promise.resolve();

            expect(importer).toHaveBeenCalledTimes(1);
            expect(initMusicPlayer).toHaveBeenCalledTimes(1);
            expect(document.getElementById('music-player').hidden).toBe(false);
        } finally {
            if (typeof originalIdleCallback === 'undefined') {
                delete window.requestIdleCallback;
            } else {
                window.requestIdleCallback = originalIdleCallback;
            }
            vi.useRealTimers();
        }
    });
});
