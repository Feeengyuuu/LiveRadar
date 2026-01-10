/**
 * ====================================================================
 * Lazy Image Loading Module
 * ====================================================================
 *
 * Provides intelligent image loading with:
 * - Intersection Observer-based lazy loading
 * - Placeholder/blur-up effect
 * - Error handling with fallback images
 * - Image preloading for critical images
 * - Memory-efficient image caching
 *
 * @module utils/lazy-image
 */

import { Logger } from './logger.js';

const log = Logger.create('LazyImage');

// ====================================================================
// Configuration
// ====================================================================

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    // IntersectionObserver options
    rootMargin: '50px 0px',  // Start loading 50px before entering viewport
    threshold: 0.01,          // Trigger when 1% visible

    // Placeholder
    placeholderColor: '#1a1a1a',
    placeholderImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"%3E%3C/svg%3E',

    // Error fallback
    fallbackImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9" fill="%23333"%3E%3Crect width="16" height="9"/%3E%3Ctext x="8" y="5" text-anchor="middle" fill="%23666" font-size="2"%3E%3C/text%3E%3C/svg%3E',

    // Retry settings
    maxRetries: 2,
    retryDelay: 1000,

    // Classes
    loadingClass: 'lazy-loading',
    loadedClass: 'lazy-loaded',
    errorClass: 'lazy-error'
};

// ====================================================================
// State
// ====================================================================

/**
 * IntersectionObserver instance
 * @type {IntersectionObserver|null}
 */
let observer = null;

/**
 * Image retry counts
 * @type {Map<HTMLImageElement, number>}
 */
const retryCounts = new Map();

/**
 * Preloaded image cache
 * @type {Map<string, HTMLImageElement>}
 */
const preloadCache = new Map();

/**
 * Configuration
 * @type {Object}
 */
let config = { ...DEFAULT_CONFIG };

// ====================================================================
// Core Functions
// ====================================================================

/**
 * Initialize lazy loading
 * @param {Object} [options] - Configuration options
 */
export function initLazyLoading(options = {}) {
    config = { ...DEFAULT_CONFIG, ...options };

    // Check for IntersectionObserver support
    if (!('IntersectionObserver' in window)) {
        log.warn('IntersectionObserver not supported, using fallback');
        // Fallback: load all images immediately
        document.querySelectorAll('img[data-lazy-src]').forEach(loadImage);
        return;
    }

    // Create observer
    observer = new IntersectionObserver(handleIntersection, {
        rootMargin: config.rootMargin,
        threshold: config.threshold
    });

    // Observe existing lazy images
    observeImages();

    log.info('Lazy loading initialized');
}

/**
 * Handle intersection changes
 * @param {IntersectionObserverEntry[]} entries - Observer entries
 */
function handleIntersection(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            loadImage(img);
            observer?.unobserve(img);
        }
    });
}

/**
 * Load a lazy image
 * @param {HTMLImageElement} img - Image element
 */
function loadImage(img) {
    const src = img.dataset.lazySrc;
    if (!src) return;

    // Add loading class
    img.classList.add(config.loadingClass);

    // Create a new image to test loading
    const testImg = new Image();

    testImg.onload = () => {
        img.src = src;
        img.classList.remove(config.loadingClass);
        img.classList.add(config.loadedClass);
        img.removeAttribute('data-lazy-src');
        retryCounts.delete(img);
        log.debug('Image loaded:', src.substring(0, 50) + '...');
    };

    testImg.onerror = () => {
        handleImageError(img, src);
    };

    testImg.src = src;
}

/**
 * Handle image loading error
 * @param {HTMLImageElement} img - Image element
 * @param {string} src - Original source URL
 */
function handleImageError(img, src) {
    const retryCount = retryCounts.get(img) || 0;

    if (retryCount < config.maxRetries) {
        // Retry after delay
        retryCounts.set(img, retryCount + 1);
        log.debug(`Retrying image (${retryCount + 1}/${config.maxRetries}):`, src.substring(0, 50));

        setTimeout(() => {
            loadImage(img);
        }, config.retryDelay * (retryCount + 1));
    } else {
        // Max retries reached, use fallback
        img.src = config.fallbackImage;
        img.classList.remove(config.loadingClass);
        img.classList.add(config.errorClass);
        img.removeAttribute('data-lazy-src');
        retryCounts.delete(img);
        log.warn('Image failed to load:', src.substring(0, 50));
    }
}

/**
 * Observe all lazy images in the document
 */
export function observeImages() {
    if (!observer) return;

    document.querySelectorAll('img[data-lazy-src]').forEach(img => {
        observer.observe(img);
    });
}

/**
 * Observe a single image element
 * @param {HTMLImageElement} img - Image element to observe
 */
export function observeImage(img) {
    if (!observer) {
        loadImage(img);
        return;
    }

    if (img.dataset.lazySrc) {
        observer.observe(img);
    }
}

// ====================================================================
// Preloading
// ====================================================================

/**
 * Preload an image (for critical images)
 * @param {string} src - Image source URL
 * @returns {Promise<HTMLImageElement>} Loaded image element
 */
export function preloadImage(src) {
    // Check cache
    if (preloadCache.has(src)) {
        return Promise.resolve(preloadCache.get(src));
    }

    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            preloadCache.set(src, img);
            resolve(img);
        };

        img.onerror = () => {
            reject(new Error(`Failed to preload: ${src}`));
        };

        img.src = src;
    });
}

/**
 * Preload multiple images
 * @param {string[]} sources - Array of image URLs
 * @returns {Promise<HTMLImageElement[]>} Array of loaded images
 */
export function preloadImages(sources) {
    return Promise.all(sources.map(src => preloadImage(src).catch(() => null)));
}

// ====================================================================
// Utility Functions
// ====================================================================

/**
 * Create a lazy image element
 * @param {string} src - Image source URL
 * @param {Object} [options] - Image options
 * @param {string} [options.alt] - Alt text
 * @param {string} [options.className] - CSS class
 * @param {string} [options.placeholder] - Placeholder image/color
 * @returns {HTMLImageElement} Image element
 */
export function createLazyImage(src, options = {}) {
    const img = document.createElement('img');

    img.dataset.lazySrc = src;
    img.src = options.placeholder || config.placeholderImage;

    if (options.alt) img.alt = options.alt;
    if (options.className) img.className = options.className;

    // Set placeholder background
    img.style.backgroundColor = config.placeholderColor;

    return img;
}

/**
 * Update an existing image to lazy load
 * @param {HTMLImageElement} img - Image element
 * @param {string} newSrc - New image source
 */
export function setLazySource(img, newSrc) {
    if (!newSrc) return;

    // If already showing this image, skip
    if (img.src === newSrc) return;

    img.dataset.lazySrc = newSrc;
    img.classList.remove(config.loadedClass, config.errorClass);

    // Observe if observer exists
    if (observer) {
        observer.observe(img);
    } else {
        loadImage(img);
    }
}

/**
 * Force load all lazy images (useful before print, etc.)
 */
export function loadAllImages() {
    document.querySelectorAll('img[data-lazy-src]').forEach(img => {
        observer?.unobserve(img);
        loadImage(img);
    });
}

/**
 * Clear preload cache to free memory
 */
export function clearPreloadCache() {
    preloadCache.clear();
    log.debug('Preload cache cleared');
}

/**
 * Disconnect observer (cleanup)
 */
export function destroy() {
    observer?.disconnect();
    observer = null;
    retryCounts.clear();
    preloadCache.clear();
    log.info('Lazy loading destroyed');
}

// ====================================================================
// Export
// ====================================================================

export const LazyImage = {
    init: initLazyLoading,
    observe: observeImage,
    observeAll: observeImages,
    preload: preloadImage,
    preloadMany: preloadImages,
    create: createLazyImage,
    setSource: setLazySource,
    loadAll: loadAllImages,
    clearCache: clearPreloadCache,
    destroy
};

export default LazyImage;
