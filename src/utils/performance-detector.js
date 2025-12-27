/**
 * ============================================================
 * Performance Detector - Automatic device performance detection and configuration adjustment
 * ============================================================
 * Detects device capabilities (memory, CPU cores) and automatically enables
 * performance mode on low-end devices to reduce resource consumption.
 */

import { APP_CONFIG } from '../config/constants.js';

/**
 * Performance detection and optimization module
 */
export const PerformanceDetector = {
    /**
     * Detect device performance and apply optimizations if needed
     */
    detect() {
        const memory = navigator.deviceMemory || 4; // GB
        const cores = navigator.hardwareConcurrency || 2;

        // Detect low-performance devices
        if (memory < APP_CONFIG.PERFORMANCE.LOW_MEMORY_THRESHOLD ||
            cores < APP_CONFIG.PERFORMANCE.LOW_CPU_THRESHOLD) {
            APP_CONFIG.PERFORMANCE.ENABLE_PERFORMANCE_MODE = true;
            this.applyPerformanceMode();
        }

        if (APP_CONFIG.DEBUG.LOG_PERFORMANCE) {
            console.log(`[性能检测] 内存: ${memory}GB, CPU核心: ${cores}, 性能模式: ${APP_CONFIG.PERFORMANCE.ENABLE_PERFORMANCE_MODE ? '开启' : '关闭'}`);
        }
    },

    /**
     * Apply performance mode optimizations
     * Reduces resource consumption by:
     * - Lowering snow particle count
     * - Reducing concurrent requests
     * - Increasing batch sizes
     */
    applyPerformanceMode() {
        // Reduce snow particle count
        APP_CONFIG.SNOW.COUNT = 50;
        APP_CONFIG.SNOW.POSITION_UPDATE_INTERVAL = 200;

        // Reduce concurrency
        APP_CONFIG.CONCURRENCY.DEFAULT = 4;
        APP_CONFIG.CONCURRENCY.MEDIUM = 6;
        APP_CONFIG.CONCURRENCY.HIGH = 8;

        // Increase batch size
        APP_CONFIG.BATCH.SIZE_SMALL = 3;
        APP_CONFIG.BATCH.SIZE_LARGE = 6;

        console.log('[性能优化] 已启用性能模式，降低资源消耗');
    }
};

/**
 * Initialize performance detection
 * Call this function on application startup
 */
export function initPerformanceDetector() {
    PerformanceDetector.detect();
}
