/**
 * ====================================================================
 * File Protocol Warning - CORS Detection and User Guidance
 * ====================================================================
 *
 * Features:
 * - Detect file:// protocol usage
 * - Display warning banner for CORS limitations
 * - Persistent dismiss state management
 * - Deployment guide display
 * - localStorage fallback for restricted environments
 *
 * @module core/file-protocol-warning
 */

import { SafeStorage } from '../utils/safe-storage.js';
import { showToast } from '../utils/helpers.js';

// ====================================================================
// File Protocol Detection
// ====================================================================

/**
 * Check if running under file:// protocol and show warning if needed
 */
export function checkFileProtocol() {
    // Only show warning under file:// protocol
    if (window.location.protocol !== 'file:') {
        return;
    }

    // Check if user has permanently dismissed the warning
    let permanentlyDismissed = false;
    try {
        permanentlyDismissed = SafeStorage.getItem('hide_file_protocol_warning') === 'true';
    } catch (e) {
        console.warn('[File Warning] localStorage read failed, using memory mode:', e.message);
        permanentlyDismissed = window._fileWarningDismissed || false;
    }

    if (permanentlyDismissed) {
        console.log('[File Warning] User chose not to show again');
        return;
    }

    // Show warning banner
    const warningBanner = document.getElementById('file-protocol-warning');
    if (warningBanner) {
        warningBanner.classList.remove('hidden');
        console.log('[File Warning] Displayed file:// protocol warning banner');
    }
}

// ====================================================================
// Warning Dismissal Functions
// ====================================================================

/**
 * Temporarily close warning banner (current session only)
 */
export function dismissFileWarning() {
    const warningBanner = document.getElementById('file-protocol-warning');
    if (warningBanner) {
        warningBanner.classList.add('hidden');
        console.log('[File Warning] User temporarily dismissed warning');
    }
}

/**
 * Permanently close warning banner (save to localStorage)
 */
export function dismissFileWarningPermanently() {
    try {
        SafeStorage.setItem('hide_file_protocol_warning', 'true');
        console.log('[File Warning] User chose not to show again, saved to localStorage');
    } catch (e) {
        console.warn('[File Warning] localStorage save failed, using memory mode:', e.message);
        window._fileWarningDismissed = true;
    }

    const warningBanner = document.getElementById('file-protocol-warning');
    if (warningBanner) {
        warningBanner.classList.add('hidden');
    }

    showToast('✓ 已保存设置，不再显示此提示', 'info');
}

// ====================================================================
// Deployment Guide
// ====================================================================

/**
 * Show detailed deployment guide (simplified version, shows toast notification)
 */
export function showDeploymentGuide() {
    const guide = `
📚 本地HTTP服务器部署指南

【Python方案】（推荐，Windows/Mac/Linux通用）
1. 打开终端/命令提示符
2. cd 到HTML文件所在目录
3. 运行：python -m http.server 8000
4. 浏览器访问：http://localhost:8000

【Node.js方案】（需要先安装Node.js）
1. 全局安装：npm install -g http-server
2. cd 到HTML文件所在目录
3. 运行：http-server -p 8000
4. 浏览器访问：http://localhost:8000

【VS Code方案】（最简单，适合开发者）
1. 安装 "Live Server" 扩展
2. 右键HTML文件 → "Open with Live Server"
3. 自动在浏览器中打开

详细文档请查看项目 docs/guides/ 目录
    `.trim();

    // Use alert to display (can be optimized to modal later)
    alert(guide);
    console.log('[File Warning] Displayed deployment guide');
}

// ====================================================================
// Window API Exposure (for HTML onclick handlers)
// ====================================================================

/**
 * Initialize file protocol warning module and expose global functions
 */
export function initFileProtocolWarning() {
    // Expose functions to window for HTML onclick handlers
    window.dismissFileWarning = dismissFileWarning;
    window.dismissFileWarningPermanently = dismissFileWarningPermanently;
    window.showDeploymentGuide = showDeploymentGuide;

    // Run initial check
    checkFileProtocol();
}

// ====================================================================
// Exports
// ====================================================================

export default {
    checkFileProtocol,
    dismissFileWarning,
    dismissFileWarningPermanently,
    showDeploymentGuide,
    init: initFileProtocolWarning
};

// Alias for main.js compatibility
export { checkFileProtocol as checkFileProtocolAndWarn };
