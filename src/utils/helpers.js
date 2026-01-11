/**
 * ====================================================================
 * Utility Helper Functions
 * ====================================================================
 *
 * Centralized utility functions including:
 * - Number formatting (heat, duration)
 * - Debounce and throttle
 * - Array and object utilities
 * - DOM utilities
 * - Toast notifications
 */

// ====================================================================
// Number Formatting
// ====================================================================

/**
 * Format viewer count with K/W suffixes
 * @param {number} num - Number to format
 * @returns {string} Formatted string
 */
export function formatHeat(num) {
  if (!num || num < 0) return '0';
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

/**
 * Parse viewer/heat values into a number (handles units like 万/K/M).
 * @param {*} value - Raw viewer value
 * @returns {number} Parsed viewer count
 */
export function parseHeatValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }
  if (typeof value !== 'string') return 0;

  const raw = value.trim();
  if (!raw) return 0;

  const normalized = raw.replace(/,/g, '').toLowerCase();
  const match = normalized.match(/([\d.]+)\s*([万wkm])?/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return 0;

  const unit = match[2];
  if (unit === '万' || unit === 'w') return Math.round(num * 10000);
  if (unit === 'k') return Math.round(num * 1000);
  if (unit === 'm') return Math.round(num * 1000000);

  return Math.max(0, Math.floor(num));
}

/**
 * Format duration from milliseconds to HH:MM:SS or MM:SS
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(ms) {
  if (!ms || ms < 0) return '00:00';

  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ====================================================================
// Debounce & Throttle - Unified Implementation
// ====================================================================

/**
 * Debounce function execution
 * Delays invoking func until after wait milliseconds have elapsed
 * since the last time the debounced function was invoked.
 *
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to delay
 * @param {Object} [options] - Options object
 * @param {boolean} [options.leading=false] - Invoke on leading edge
 * @param {boolean} [options.trailing=true] - Invoke on trailing edge
 * @param {number} [options.maxWait] - Maximum time to wait before forcing invocation
 * @returns {Function} Debounced function with cancel() and flush() methods
 *
 * @example
 * // Basic usage
 * const debouncedSave = debounce(save, 300);
 *
 * // With leading edge
 * const debouncedClick = debounce(onClick, 300, { leading: true, trailing: false });
 *
 * // With maxWait (like throttle but with debounce behavior)
 * const debouncedScroll = debounce(onScroll, 100, { maxWait: 300 });
 */
export function debounce(func, wait, options = {}) {
  const { leading = false, trailing = true, maxWait } = options;

  let timeout = null;
  let lastArgs = null;
  let lastThis = null;
  let lastCallTime = 0;
  let lastInvokeTime = 0;
  let result;

  // Ensure wait is a positive number
  wait = Math.max(0, wait) || 0;
  const hasMaxWait = maxWait !== undefined;
  const maxWaitMs = hasMaxWait ? Math.max(maxWait, wait) : 0;

  function invokeFunc(time) {
    const args = lastArgs;
    const thisArg = lastThis;

    lastArgs = lastThis = null;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }

  function shouldInvoke(time) {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    // First call, or activity after trailing edge
    return (
      lastCallTime === 0 ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      (hasMaxWait && timeSinceLastInvoke >= maxWaitMs)
    );
  }

  function remainingWait(time) {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = wait - timeSinceLastCall;

    return hasMaxWait
      ? Math.min(timeWaiting, maxWaitMs - timeSinceLastInvoke)
      : timeWaiting;
  }

  function timerExpired() {
    const time = Date.now();

    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }

    // Restart the timer
    timeout = setTimeout(timerExpired, remainingWait(time));
  }

  function trailingEdge(time) {
    timeout = null;

    if (trailing && lastArgs) {
      return invokeFunc(time);
    }

    lastArgs = lastThis = null;
    return result;
  }

  function leadingEdge(time) {
    lastInvokeTime = time;
    timeout = setTimeout(timerExpired, wait);

    return leading ? invokeFunc(time) : result;
  }

  function cancel() {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timeout = null;
  }

  function flush() {
    if (timeout === null) {
      return result;
    }
    return trailingEdge(Date.now());
  }

  function pending() {
    return timeout !== null;
  }

  function debounced(...args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timeout === null) {
        return leadingEdge(time);
      }
      if (hasMaxWait) {
        // Handle invocations in tight loop
        timeout = setTimeout(timerExpired, wait);
        return invokeFunc(time);
      }
    }

    if (timeout === null) {
      timeout = setTimeout(timerExpired, wait);
    }

    return result;
  }

  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.pending = pending;

  return debounced;
}

/**
 * Throttle function execution
 * Limits how often a function can be called.
 * Guarantees the function is called at most once per wait period.
 *
 * @param {Function} func - Function to throttle
 * @param {number} wait - Minimum milliseconds between invocations
 * @param {Object} [options] - Options object
 * @param {boolean} [options.leading=true] - Invoke on leading edge
 * @param {boolean} [options.trailing=true] - Invoke on trailing edge
 * @returns {Function} Throttled function with cancel() and flush() methods
 *
 * @example
 * // Basic usage - fires at most once per 100ms
 * const throttledScroll = throttle(onScroll, 100);
 *
 * // Only on leading edge (immediate, then ignore)
 * const throttledClick = throttle(onClick, 1000, { trailing: false });
 */
export function throttle(func, wait, options = {}) {
  const { leading = true, trailing = true } = options;
  return debounce(func, wait, {
    leading,
    trailing,
    maxWait: wait
  });
}

/**
 * RequestAnimationFrame-based throttle
 * Limits function calls to once per animation frame (~16ms at 60fps)
 * Ideal for scroll/resize handlers and animations
 *
 * @param {Function} func - Function to throttle
 * @returns {Function} RAF-throttled function with cancel() method
 *
 * @example
 * const throttledUpdate = rafThrottle(updatePosition);
 * window.addEventListener('scroll', throttledUpdate);
 */
export function rafThrottle(func) {
  let rafId = null;
  let lastArgs = null;
  let lastThis = null;

  function throttled(...args) {
    lastArgs = args;
    lastThis = this;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        func.apply(lastThis, lastArgs);
      });
    }
  }

  throttled.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return throttled;
}

/**
 * Get random item from array
 */
export function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Show toast notification
 * Limited to maximum 5 toasts to prevent infinite stacking
 */
export function showToast(message, typeOrDuration = 3000, durationOverride) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const DEFAULT_DURATION = 3000;
  let type = 'info';
  let duration = DEFAULT_DURATION;

  if (typeof typeOrDuration === 'number') {
    duration = typeOrDuration;
  } else if (typeof typeOrDuration === 'string') {
    type = typeOrDuration;
    if (typeof durationOverride === 'number') duration = durationOverride;
  } else if (typeOrDuration && typeof typeOrDuration === 'object') {
    if (typeof typeOrDuration.type === 'string') type = typeOrDuration.type;
    if (typeof typeOrDuration.duration === 'number') duration = typeOrDuration.duration;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    duration = DEFAULT_DURATION;
  }

  const normalizedType = String(type).toLowerCase();
  const typeMap = { warn: 'warning' };
  const finalType = typeMap[normalizedType] || normalizedType;
  const allowedTypes = new Set(['info', 'success', 'error', 'warning']);
  const toastType = allowedTypes.has(finalType) ? finalType : 'info';

  // Limit maximum number of toasts to 5
  const MAX_TOASTS = 5;
  const existingToasts = container.querySelectorAll('.toast');
  if (existingToasts.length >= MAX_TOASTS) {
    // Remove oldest toast (first child)
    existingToasts[0].remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.classList.add(`toast--${toastType}`);
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, duration);
}
