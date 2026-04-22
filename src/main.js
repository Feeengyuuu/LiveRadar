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
import { getRandomItem, showToast } from './utils/helpers.js';
import { PerformanceDetector } from './utils/performance-detector.js';
import { LOADING_MESSAGES } from './config/constants.js';
import { renderErrorScreen } from './core/error-screen.js';
import { initFaviconAnimation } from './core/favicon-animation.js';

// ============================================================
// 4. Import Bootstrap Module
// ============================================================
import { initializeApp, hideLoader } from './core/bootstrap.js';
import { checkFileProtocolAndWarn } from './core/file-protocol-warning.js';

// ============================================================
// 5. Global Error Boundary
// ============================================================

import { ErrorHandler } from './utils/error-handler.js';

let errorPageShown = false;

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
        renderErrorScreen({
            container: mainContent,
            errorMessage,
            errorStack: error?.stack || error?.message || '',
            isDev: Boolean(import.meta.env?.DEV),
            onReload: () => window.location.reload(),
            onClearCache: () => {
                localStorage.clear();
                window.location.reload();
            }
        });
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
    if (!errorPageShown) {
        errorPageShown = true;
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

    showToast('操作失败，请重试', 'error');

    event.preventDefault();
});

console.log('[LiveRadar] ✓ Global error boundary initialized');

// ============================================================
// 6. Startup Sequence
// ============================================================

console.log('[LiveRadar] Starting application...');

// Set random loader text
const loaderTextEl = document.getElementById('loader-text');
if (loaderTextEl) {
    loaderTextEl.textContent = getRandomItem(LOADING_MESSAGES);
}

// Run performance detection (immediate)
PerformanceDetector.detect();

// Start favicon animation after the basic shell exists.
initFaviconAnimation();

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
        await initializeApp();
        console.log('[LiveRadar] ✓ Application started successfully');
    } catch (error) {
        console.error('[LiveRadar] ✗ Application startup failed:', error);

        // Show error page instead of just toast
        showErrorPage(error, 'AppInitialization');
    } finally {
        // 确保 loader 始终被移除，即使初始化失败
        hideLoader();
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
