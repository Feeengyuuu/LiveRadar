/**
 * ====================================================================
 * File Protocol Warning - CORS Detection and User Guidance
 * ====================================================================
 *
 * Renders an in-page warning banner when the app is opened via file://
 * and keeps all interactions module-local.
 *
 * @module core/file-protocol-warning
 */

import { SafeStorage } from '../utils/safe-storage.js';
import { showToast } from '../utils/helpers.js';

let memoryDismissed = false;

function getWarningBanner() {
    return document.getElementById('file-protocol-warning');
}

function createElement(tag, className, textContent) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (textContent != null) element.textContent = textContent;
    return element;
}

function createButton(label, className, onClick) {
    const button = createElement('button', className, label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
}

function createSolutionCard(title, code, hint) {
    const card = createElement('div', 'solution-card');
    const heading = createElement('div', 'solution-title', title);
    const codeBlock = createElement('div', 'solution-code', code);
    const hintText = createElement('div', 'solution-hint', hint);
    card.append(heading, codeBlock, hintText);
    return card;
}

export function renderFileProtocolWarning() {
    const warningBanner = getWarningBanner();
    if (!warningBanner || warningBanner.dataset.rendered === 'true') return warningBanner;

    const header = createElement('div', 'warning-header');
    const icon = createElement('span', 'warning-icon', '⚠️');
    const title = createElement('div', 'warning-title', '当前通过 file:// 打开，网络请求会被浏览器限制');
    const closeBtn = createButton('×', 'warning-close', dismissFileWarning);
    closeBtn.setAttribute('aria-label', '关闭提示');
    header.append(icon, title, closeBtn);

    const message = createElement(
        'div',
        'warning-message',
        'LiveRadar 需要访问直播平台接口。直接双击 HTML 文件时，浏览器会阻止部分请求，建议改用本地 HTTP 服务器打开。'
    );

    const solutions = createElement('div', 'warning-solutions');
    solutions.append(
        createSolutionCard('Python', 'python -m http.server 8000', '进入项目目录后执行，浏览器访问 http://localhost:8000'),
        createSolutionCard('Node.js', 'npx http-server -p 8000', '适合已有 Node 环境的本地预览'),
        createSolutionCard('VS Code', 'Live Server', '右键 index.html 并选择 “Open with Live Server”')
    );

    const actions = createElement('div', 'warning-actions');
    actions.append(
        createButton('查看部署指南', 'warning-btn warning-btn-primary', showDeploymentGuide),
        createButton('不再提示', 'warning-btn warning-btn-secondary', dismissFileWarningPermanently),
        createButton('本次关闭', 'warning-btn warning-btn-secondary', dismissFileWarning)
    );

    warningBanner.append(header, message, solutions, actions);
    warningBanner.dataset.rendered = 'true';
    return warningBanner;
}

function isPermanentlyDismissed() {
    try {
        return SafeStorage.getItem('hide_file_protocol_warning') === 'true';
    } catch (error) {
        console.warn('[File Warning] localStorage read failed, using memory mode:', error.message);
        return memoryDismissed;
    }
}

/**
 * Check if running under file:// protocol and show warning if needed
 */
export function checkFileProtocol(protocol = window.location.protocol) {
    if (protocol !== 'file:') {
        return;
    }

    if (isPermanentlyDismissed()) {
        console.log('[File Warning] User chose not to show again');
        return;
    }

    const warningBanner = renderFileProtocolWarning();
    if (warningBanner) {
        warningBanner.classList.remove('hidden');
        console.log('[File Warning] Displayed file:// protocol warning banner');
    }
}

/**
 * Temporarily close warning banner (current session only)
 */
export function dismissFileWarning() {
    const warningBanner = getWarningBanner();
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
        const saved = SafeStorage.setItem('hide_file_protocol_warning', 'true');
        if (!saved) {
            memoryDismissed = true;
            console.warn('[File Warning] localStorage save failed, using memory mode');
        } else {
            console.log('[File Warning] User chose not to show again, saved to localStorage');
        }
    } catch (error) {
        console.warn('[File Warning] localStorage save failed, using memory mode:', error.message);
        memoryDismissed = true;
    }

    dismissFileWarning();
    showToast('✓ 已保存设置，不再显示此提示', 'info');
}

/**
 * Show detailed deployment guide
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
1. 运行：npx http-server -p 8000
2. 浏览器访问：http://localhost:8000

【VS Code方案】（最简单，适合开发者）
1. 安装 "Live Server" 扩展
2. 右键HTML文件 → "Open with Live Server"
3. 自动在浏览器中打开
    `.trim();

    alert(guide);
    console.log('[File Warning] Displayed deployment guide');
}

export default {
    checkFileProtocol,
    dismissFileWarning,
    dismissFileWarningPermanently,
    showDeploymentGuide,
    render: renderFileProtocolWarning,
};

export { checkFileProtocol as checkFileProtocolAndWarn };

export function resetFileProtocolWarningForTests() {
    memoryDismissed = false;
}
