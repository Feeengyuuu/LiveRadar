/**
 * ====================================================================
 * LiveRadar v3.1.1 - Main Entry Point
 * ====================================================================
 *
 * Lightweight entry file that coordinates application startup.
 * Heavy lifting is delegated to bootstrap and globals modules.
 *
 * Responsibilities:
 * - Import CSS
 * - Set random loader text
 * - Run performance detection
 * - Trigger bootstrap initialization
 * - Support Vite HMR
 * ==================================================================== */

// ============================================================
// 1. Import CSS (Vite will handle bundling)
// ============================================================
import './styles/main.css';
import './styles/components/music-player.css';

// ============================================================
// 2. Import Configuration (Side Effects)
// ============================================================
import './config/signer.js'; // Initialize API signers

// ============================================================
// 3. Import Utilities
// ============================================================
import { getRandomItem } from './utils/helpers.js';
import { PerformanceDetector } from './utils/performance-detector.js';
import { LOADING_MESSAGES } from './config/constants.js';

// ============================================================
// 4. Import Bootstrap Module
// ============================================================
import { initializeApp, hideLoader } from './core/bootstrap.js';
import { checkFileProtocolAndWarn } from './core/file-protocol-warning.js';

// ============================================================
// 5. Global Error Boundary
// ============================================================

import { ErrorHandler } from './utils/error-handler.js';

/**
 * Show user-friendly error page
 * @param {Error} error - Error object
 * @param {string} context - Error context
 */
function showErrorPage(error, context) {
    const loader = document.getElementById('initial-loader');
    if (loader) loader.style.display = 'none';

    document.body.classList.remove('loading');

    let errorMessage = '应用发生了一个错误';
    if (error.message) {
        errorMessage = ErrorHandler.getUserFriendlyMessage(error);
    }

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; text-align: center; padding: 2rem;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">⚠️</div>
                <h2 style="color: #ef4444; font-size: 1.5rem; margin-bottom: 1rem;">应用初始化失败</h2>
                <p style="color: #9ca3af; margin-bottom: 2rem; max-width: 500px;">${errorMessage}</p>
                <div style="display: flex; gap: 1rem;">
                    <button onclick="location.reload()" style="background: #ef4444; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600;">
                        刷新页面
                    </button>
                    <button onclick="localStorage.clear(); location.reload()" style="background: #6b7280; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600;">
                        清除缓存并刷新
                    </button>
                </div>
                ${import.meta.env?.DEV ? `<details style="margin-top: 2rem; text-align: left; max-width: 600px;"><summary style="cursor: pointer; color: #9ca3af;">技术详情</summary><pre style="background: #1f1f1f; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin-top: 1rem; color: #ef4444; font-size: 0.875rem;">${error.stack || error.message}</pre></details>` : ''}
            </div>
        `;
    }

    // Log to error handler
    ErrorHandler.log(error, context);
}

/**
 * Global error handler for uncaught errors
 */
window.addEventListener('error', (event) => {
    console.error('[Global Error]', event.error);
    ErrorHandler.log(event.error, 'UncaughtError');

    // Prevent multiple error pages
    if (!window._errorPageShown) {
        window._errorPageShown = true;
        showErrorPage(event.error, 'UncaughtError');
    }

    event.preventDefault();
});

/**
 * Global handler for unhandled promise rejections
 */
window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Promise Rejection]', event.reason);
    ErrorHandler.log(event.reason, 'UnhandledPromise');

    // Show user-friendly message
    if (window.showToast) {
        window.showToast('操作失败，请重试', 'error');
    }

    event.preventDefault();
});

console.log('[LiveRadar] ✓ Global error boundary initialized');

// ============================================================
// 6. Startup Sequence
// ============================================================

console.log('[LiveRadar] Starting application...');

// Record loader start time for minimum display duration
const loaderStartTime = Date.now();

// Set random loader text
const loaderTextEl = document.getElementById('loader-text');
if (loaderTextEl) {
    loaderTextEl.textContent = getRandomItem(LOADING_MESSAGES);
}

// Run performance detection (immediate)
PerformanceDetector.detect();

// Check for file:// protocol and show warning if needed
checkFileProtocolAndWarn();

// ============================================================
// 7. Initialize Application
// ============================================================

/**
 * Main initialization wrapper
 * Handles DOMContentLoaded and error recovery
 */
async function startApp() {
    try {
        await initializeApp(loaderStartTime);
        console.log('[LiveRadar] ✓ Application started successfully');
    } catch (error) {
        console.error('[LiveRadar] ✗ Application startup failed:', error);

        // Show error page instead of just toast
        showErrorPage(error, 'AppInitialization');
    } finally {
        // 确保 loader 始终被移除，即使初始化失败
        hideLoader(loaderStartTime);
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    // DOM already loaded
    startApp();
}

// ============================================================
// 8. Vite Hot Module Replacement (Development Only)
// ============================================================
if (import.meta.hot) {
    import.meta.hot.accept();
}

console.log('[LiveRadar] main.js loaded');
