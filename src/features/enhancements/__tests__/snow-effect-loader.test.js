// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../core/state.js', () => ({
    isSnowEnabled: vi.fn(() => false)
}));

const {
    initSnow,
    resetSnowEffectLoaderForTests,
    toggleSnow,
    updateSnowBtn
} = await import('../snow-effect-loader.js');

const { isSnowEnabled } = await import('../../../core/state.js');

describe('snow-effect-loader', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button id="snow-toggle-btn" class="snow-toggle-btn off"></button>
            <canvas id="snow-canvas"></canvas>
        `;
        isSnowEnabled.mockReturnValue(false);
        resetSnowEffectLoaderForTests();
        vi.clearAllMocks();
    });

    it('keeps the shell synced without loading the full effect while disabled', async () => {
        const importer = vi.fn();

        await initSnow({ importer });

        expect(importer).not.toHaveBeenCalled();
        expect(document.getElementById('snow-toggle-btn').classList.contains('off')).toBe(true);
        expect(document.getElementById('snow-canvas').style.display).toBe('none');
    });

    it('initializes the full effect before first toggle', async () => {
        const init = vi.fn();
        const toggle = vi.fn();
        const importer = vi.fn(async () => ({
            initSnow: init,
            toggleSnow: toggle,
            updateSnowBtn: vi.fn()
        }));

        await toggleSnow({ importer });
        await toggleSnow({ importer });

        expect(importer).toHaveBeenCalledTimes(1);
        expect(init).toHaveBeenCalledTimes(1);
        expect(toggle).toHaveBeenCalledTimes(2);
    });

    it('delegates button updates after the effect has loaded', async () => {
        const update = vi.fn();
        const importer = vi.fn(async () => ({
            initSnow: vi.fn(),
            toggleSnow: vi.fn(),
            updateSnowBtn: update
        }));

        await toggleSnow({ importer });
        updateSnowBtn();

        expect(update).toHaveBeenCalledTimes(1);
    });
});
