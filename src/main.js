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
// 5. Startup Sequence
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
// 6. Initialize Application
// ============================================================

/**
 * Main initialization wrapper
 * Handles DOMContentLoaded and error recovery
 */
async function startApp() {
    try {
        await initializeApp(loaderStartTime);
        hideLoader(loaderStartTime);
        console.log('[LiveRadar] ✓ Application started successfully');
    } catch (error) {
        console.error('[LiveRadar] ✗ Application startup failed:', error);
        // showToast is exposed by bootstrap, so it should be available here
        window.showToast?.('应用初始化失败，请刷新页面重试');
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
// 7. Vite Hot Module Replacement (Development Only)
// ============================================================
if (import.meta.hot) {
    import.meta.hot.accept();
}

console.log('[LiveRadar] main.js loaded');
