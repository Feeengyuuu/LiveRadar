/**
 * Warning Banner Module
 * File protocol (file://) warning and deployment guide
 */

import { SafeStorage } from '../utils/safe-storage.js';

/**
 * Check if running on file:// protocol and show warning
 */
export function checkFileProtocolAndWarn() {
    // Only show warning on file:// protocol
    if (window.location.protocol !== 'file:') {
        return;
    }

    // Check if user permanently dismissed the warning
    let permanentlyDismissed = false;
    try {
        permanentlyDismissed = SafeStorage.getItem('hide_file_protocol_warning') === 'true';
    } catch (error) {
        console.warn('[Warning Banner] localStorage read failed, using memory mode:', error.message);
        permanentlyDismissed = window._fileWarningDismissed || false;
    }

    if (permanentlyDismissed) {
        console.log('[Warning Banner] User chose not to show warning again');
        return;
    }

    // Show warning banner
    const warningBanner = document.getElementById('file-protocol-warning');
    if (warningBanner) {
        warningBanner.classList.remove('hidden');
        console.log('[Warning Banner] Displayed file:// protocol warning');
    }
}

/**
 * Dismiss warning temporarily (current session only)
 */
export function dismissFileWarning() {
    const warningBanner = document.getElementById('file-protocol-warning');
    if (warningBanner) {
        warningBanner.classList.add('hidden');
        console.log('[Warning Banner] User dismissed warning temporarily');
    }
}

/**
 * Dismiss warning permanently (save to localStorage)
 */
export function dismissFileWarningPermanently() {
    try {
        SafeStorage.setItem('hide_file_protocol_warning', 'true');
        console.log('[Warning Banner] User chose not to show again, saved to localStorage');
    } catch (error) {
        console.warn('[Warning Banner] localStorage save failed, using memory mode:', error.message);
        window._fileWarningDismissed = true;
    }

    const warningBanner = document.getElementById('file-protocol-warning');
    if (warningBanner) {
        warningBanner.classList.add('hidden');
    }

    window.showToast?.('✓ 已保存设置，不再显示此提示', 'info');
}

/**
 * Show deployment guide (simplified version)
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

    // Show as alert (can be upgraded to modal later)
    alert(guide);
    console.log('[Warning Banner] Displayed deployment guide');
}

// Make globally accessible for onclick handlers
window.dismissFileWarning = dismissFileWarning;
window.dismissFileWarningPermanently = dismissFileWarningPermanently;
window.showDeploymentGuide = showDeploymentGuide;
