/**
 * ====================================================================
 * Image Handler - Image Loading & Event Management
 * ====================================================================
 *
 * Handles:
 * - Image load/error event management with memory leak prevention
 * - Smart image caching with time-bucketed URLs
 * - Fallback image handling
 * - Lazy loading with skeleton states
 *
 * @module core/renderer/image-handler
 */

import { APP_CONFIG } from '../../config/constants.js';

const FAST_LIVE_COVER_PLATFORMS = new Set(['twitch', 'kick', 'picarto', 'soop']);

// ====================================================================
// Image Event Handler Management (Memory Leak Prevention)
// ====================================================================

/**
 * WeakMap to track image event handlers for cleanup
 * Using WeakMap allows garbage collection when elements are removed
 */
const imageHandlers = new WeakMap();

/**
 * Safely set image load/error handlers with cleanup
 * Prevents memory leak from accumulating event handlers
 * @param {HTMLImageElement} img - Image element
 * @param {Function} onLoad - Load handler
 * @param {Function} onError - Error handler
 */
export function setImageHandlers(img, onLoad, onError) {
    // Clean up previous handlers if they exist
    const prevHandlers = imageHandlers.get(img);
    if (prevHandlers) {
        img.removeEventListener('load', prevHandlers.load);
        img.removeEventListener('error', prevHandlers.error);
    }

    // Create new handler references
    const handlers = {
        load: onLoad,
        error: onError
    };

    // Store for future cleanup
    imageHandlers.set(img, handlers);

    // Add new listeners
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError);
}

// ====================================================================
// Smart Image URL Generation
// ====================================================================

/**
 * Get smart image URL with intelligent caching strategy
 * Adds timestamps for live content, fully caches offline/replay content
 *
 * @param {string} baseUrl - Base image URL
 * @param {string} platform - Platform name
 * @param {boolean} isLive - Whether content is live
 * @returns {string} Smart URL with appropriate caching
 */
export function getSmartImageUrl(baseUrl, platform, isLive) {
    if (!baseUrl || !isLive) {
        // Offline/replay - no timestamp, full browser cache
        return baseUrl;
    }

    if (/([?&])t=\d+/.test(baseUrl)) {
        return baseUrl;
    }

    const isInternational = FAST_LIVE_COVER_PLATFORMS.has(platform);
    const intervals = APP_CONFIG.CACHE.LIVE_IMAGE_REFRESH_INTERVALS;
    const refreshInterval = isInternational
        ? intervals.INTERNATIONAL
        : intervals.DOMESTIC;

    // 🔥 Smart caching buckets
    if (isInternational) {
        // International platforms: Refresh every 5 minutes
        // Twitch/Kick update thumbnails more frequently
        const cacheKey = Math.floor(Date.now() / refreshInterval);
        return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${cacheKey}`;
    } else {
        // Domestic platforms: Refresh every 10 minutes
        // Douyu/Bilibili update less frequently
        const cacheKey = Math.floor(Date.now() / refreshInterval);
        return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${cacheKey}`;
    }
}

// ====================================================================
// Unified Image Source Setter
// ====================================================================

/**
 * Track image configs for recovery when page visibility changes
 * Maps image elements to their configuration for retry
 */
const imageConfigs = new WeakMap();

function normalizeImageSrc(src) {
    const value = String(src || '').trim();
    if (!value) return '';
    if (value.startsWith('//')) return `https:${value}`;
    return value;
}

/**
 * Unified image source setter with lazy loading and fallback support
 * Eliminates code duplication between thumbnail and avatar loading
 *
 * @param {Object} config - Configuration object
 * @param {HTMLImageElement} config.imgElement - Image element to update
 * @param {string} config.newSrc - New image source URL
 * @param {HTMLElement} [config.loaderElement] - Loading spinner element
 * @param {HTMLElement} [config.skeletonElement] - Skeleton placeholder element
 * @param {string} [config.loadedClass] - CSS class to add on successful load
 * @param {Object} [config.fallbacks] - Fallback URLs
 * @param {string} [config.fallbacks.hd] - HD fallback URL
 * @param {string} [config.fallbacks.standard] - Standard fallback URL
 * @param {boolean} [config.hideOnError] - Hide image element on error (for avatars)
 * @param {boolean} [config.forceTransition] - Force transition effect for cached images
 */
export function setImageSource(config) {
    const {
        imgElement,
        newSrc,
        loaderElement,
        skeletonElement,
        loadedClass,
        fallbacks = {},
        hideOnError = false,
        forceTransition = false
    } = config;

    const requestedSrc = normalizeImageSrc(newSrc);
    const fallbackHD = normalizeImageSrc(fallbacks.hd);
    const fallbackStandard = normalizeImageSrc(fallbacks.standard);

    imgElement.referrerPolicy = 'no-referrer';
    imgElement.decoding = 'async';
    imgElement.loading = 'lazy';

    // Clear image if no new source
    if (!requestedSrc) {
        if (imgElement.src) {
            imgElement.removeAttribute('src');
            delete imgElement.dataset.lrSrc;
            if (loadedClass) imgElement.classList.remove(loadedClass);
            if (hideOnError) imgElement.classList.add('hidden');
            if (skeletonElement) skeletonElement.classList.remove('hidden');
        }
        return;
    }

    // Only update if URL actually changed AND image is successfully loaded
    // This prevents unnecessary reloads while ensuring failed loads are retried
    if (imgElement.dataset.lrSrc === requestedSrc || imgElement.src === requestedSrc) {
        // Check if image actually loaded successfully
        // complete === true means load/error event fired
        // naturalHeight > 0 means image data is valid
        if (imgElement.complete && imgElement.naturalHeight > 0) {
            if (loadedClass) imgElement.classList.add(loadedClass);
            if (loaderElement) loaderElement.classList.add('hidden');
            if (skeletonElement) skeletonElement.classList.add('hidden');
            if (hideOnError) imgElement.classList.remove('hidden');
            // Image successfully loaded, skip reload to prevent flickering
            return;
        }
        // Image failed to load or still loading - continue to retry
        // This fixes the black screen issue when switching tabs during load
    }

    // Store config for potential recovery after visibility change
    imageConfigs.set(imgElement, {
        ...config,
        newSrc: requestedSrc,
        fallbacks: {
            hd: fallbackHD,
            standard: fallbackStandard
        }
    });

    // Prepare for loading
    if (loadedClass) imgElement.classList.remove(loadedClass);
    if (loaderElement) loaderElement.classList.remove('hidden');
    imgElement.dataset.lrSrc = requestedSrc;

    const applyLoadedState = () => {
        if (loadedClass) imgElement.classList.add(loadedClass);
        if (loaderElement) loaderElement.classList.add('hidden');
        if (skeletonElement) skeletonElement.classList.add('hidden');
        if (hideOnError) imgElement.classList.remove('hidden');

        // Clear fallback tracking
        delete imgElement.dataset.triedHD;
        delete imgElement.dataset.triedStandard;
    };

    // Set up load handlers
    setImageHandlers(
        imgElement,
        // onLoad - Success
        () => {
            if (forceTransition) {
                // Ensure a paint happens before restoring opacity for cached images.
                requestAnimationFrame(() => requestAnimationFrame(applyLoadedState));
                return;
            }
            applyLoadedState();
        },
        // onError - Try fallbacks or show skeleton
        () => {
            // Try HD fallback first
            if (fallbackHD && imgElement.src !== fallbackHD && !imgElement.dataset.triedHD) {
                imgElement.dataset.triedHD = 'true';
                imgElement.src = fallbackHD;
                return;
            }

            // Try standard fallback
            if (fallbackStandard && imgElement.src !== fallbackStandard && !imgElement.dataset.triedStandard) {
                imgElement.dataset.triedStandard = 'true';
                imgElement.src = fallbackStandard;
                return;
            }

            // All attempts failed - show skeleton/hide
            if (loaderElement) loaderElement.classList.add('hidden');
            if (skeletonElement) skeletonElement.classList.remove('hidden');
            if (hideOnError) {
                imgElement.classList.add('hidden');
            }

            // Clear fallback tracking
            delete imgElement.dataset.triedHD;
            delete imgElement.dataset.triedStandard;
        }
    );

    if (imgElement.src === requestedSrc && imgElement.complete && imgElement.naturalHeight === 0) {
        // Setting the same failed URL may not trigger a fresh load in every browser.
        imgElement.removeAttribute('src');
    }
    imgElement.src = requestedSrc;
}

// ====================================================================
// Page Visibility Recovery
// ====================================================================

/**
 * Recover failed image loads when page becomes visible again
 * This fixes black screen issues caused by tab switching during image load
 *
 * Call this function when the page visibility changes from hidden to visible
 */
export function recoverFailedImages() {
    // Find all thumbnail and avatar images in the document
    const images = document.querySelectorAll('.card-thumbnail, .u-avatar');

    images.forEach(img => {
        // Skip images that loaded successfully
        if (img.complete && img.naturalHeight > 0) {
            return;
        }

        // Skip images without a source
        if (!img.src || img.src === '') {
            return;
        }

        // Retrieve stored config if available
        const config = imageConfigs.get(img);
        if (config) {
            // Force reload by temporarily clearing src
            const originalSrc = img.src;
            img.src = '';
            // Use requestAnimationFrame to ensure browser processes the change
            requestAnimationFrame(() => {
                // Restore src to trigger reload with existing handlers
                img.src = originalSrc;
            });
        }
    });
}

/**
 * Initialize page visibility monitoring
 * Automatically recovers failed images when tab becomes visible
 */
export function initVisibilityRecovery() {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Page became visible - recover failed images after a short delay
            // Delay ensures DOM is fully ready
            setTimeout(() => {
                recoverFailedImages();
            }, 100);
        }
    });
}
