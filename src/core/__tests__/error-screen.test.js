// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderErrorScreen } = await import('../error-screen.js');

describe('error-screen', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="main-content"></div>';
    });

    it('renders the error screen with working action buttons', () => {
        const onReload = vi.fn();
        const onClearCache = vi.fn();

        renderErrorScreen({
            container: document.getElementById('main-content'),
            errorMessage: '初始化失败',
            errorStack: 'stack trace',
            isDev: false,
            onReload,
            onClearCache
        });

        const buttons = Array.from(document.querySelectorAll('button'));
        expect(document.getElementById('main-content').textContent).toContain('初始化失败');

        buttons[0].click();
        buttons[1].click();

        expect(onReload).toHaveBeenCalledTimes(1);
        expect(onClearCache).toHaveBeenCalledTimes(1);
    });

    it('renders developer stack details only in dev mode', () => {
        renderErrorScreen({
            container: document.getElementById('main-content'),
            errorMessage: '初始化失败',
            errorStack: 'stack trace',
            isDev: true,
            onReload: vi.fn(),
            onClearCache: vi.fn()
        });

        expect(document.querySelector('details')).not.toBeNull();
        expect(document.querySelector('pre').textContent).toContain('stack trace');
    });
});
