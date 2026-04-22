// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getItem: vi.fn(),
    setItem: vi.fn(),
    showToast: vi.fn()
}));

vi.mock('../../utils/safe-storage.js', () => ({
    SafeStorage: {
        getItem: mocks.getItem,
        setItem: mocks.setItem
    }
}));

vi.mock('../../utils/helpers.js', () => ({
    showToast: mocks.showToast
}));

const {
    checkFileProtocol,
    dismissFileWarning,
    dismissFileWarningPermanently,
    renderFileProtocolWarning,
    resetFileProtocolWarningForTests,
    showDeploymentGuide
} = await import('../file-protocol-warning.js');

describe('file-protocol-warning', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="file-protocol-warning" class="hidden"></div>';
        resetFileProtocolWarningForTests();
        mocks.getItem.mockReset();
        mocks.setItem.mockReset();
        mocks.showToast.mockReset();
        mocks.getItem.mockReturnValue('false');
        mocks.setItem.mockReturnValue(true);
        globalThis.alert = vi.fn();
    });

    it('renders banner content and shows it in file protocol mode', () => {
        checkFileProtocol('file:');

        const banner = document.getElementById('file-protocol-warning');
        expect(banner.classList.contains('hidden')).toBe(false);
        expect(banner.textContent).toContain('file://');
        expect(banner.textContent).toContain('python -m http.server 8000');
    });

    it('does nothing outside file protocol mode', () => {
        checkFileProtocol('https:');

        const banner = document.getElementById('file-protocol-warning');
        expect(banner.classList.contains('hidden')).toBe(true);
        expect(banner.textContent).toBe('');
    });

    it('persists permanent dismiss and hides the banner', () => {
        renderFileProtocolWarning();
        dismissFileWarningPermanently();

        expect(mocks.setItem).toHaveBeenCalledWith('hide_file_protocol_warning', 'true');
        expect(document.getElementById('file-protocol-warning').classList.contains('hidden')).toBe(true);
        expect(mocks.showToast).toHaveBeenCalledWith('✓ 已保存设置，不再显示此提示', 'info');
    });

    it('can close the banner for the current session', () => {
        renderFileProtocolWarning();
        dismissFileWarning();

        expect(document.getElementById('file-protocol-warning').classList.contains('hidden')).toBe(true);
    });

    it('shows the deployment guide with alert', () => {
        showDeploymentGuide();

        expect(globalThis.alert).toHaveBeenCalledTimes(1);
        expect(globalThis.alert.mock.calls[0][0]).toContain('本地HTTP服务器部署指南');
    });
});
