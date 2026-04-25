// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const audio = {
        volume: 1,
        currentTime: 5,
        play: vi.fn(),
        pause: vi.fn()
    };

    return {
        audio,
        getYahahaAudio: vi.fn(() => audio),
        showToast: vi.fn()
    };
});

vi.mock('../sound-effects.js', () => ({
    getYahahaAudio: mocks.getYahahaAudio
}));

vi.mock('../../../utils/helpers.js', () => ({
    showToast: mocks.showToast
}));

const { initAudioManager, unlockAllAudio } = await import('../audio-manager.js');

describe('audio-manager', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        window.audioContextUnlocked = false;
        window.hasShownAudioUnlockToast = false;

        mocks.audio.volume = 1;
        mocks.audio.currentTime = 5;
        mocks.audio.play.mockResolvedValue(undefined);
        mocks.audio.pause.mockReset();
        mocks.getYahahaAudio.mockImplementation(() => mocks.audio);
        mocks.showToast.mockReset();
    });

    it('unlocks sound effects without requiring a keepalive audio element', async () => {
        initAudioManager();

        const unlocked = await unlockAllAudio();

        expect(unlocked).toBe(true);
        expect(window.audioContextUnlocked).toBe(true);
        expect(mocks.audio.play).toHaveBeenCalledTimes(1);
        expect(mocks.audio.pause).toHaveBeenCalledTimes(1);
        expect(mocks.audio.currentTime).toBe(0);
        expect(mocks.showToast).toHaveBeenCalledWith('Audio enabled', 'info');
    });

    it('supports silent unlocks for the secret audio path', async () => {
        const unlocked = await unlockAllAudio({ silent: true });

        expect(unlocked).toBe(true);
        expect(window.audioContextUnlocked).toBe(true);
        expect(mocks.showToast).not.toHaveBeenCalled();
    });
});
