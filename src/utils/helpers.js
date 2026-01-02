/**
 * Utility Helper Functions
 */

/**
 * Format viewer count with K/W suffixes
 */
export function formatHeat(num) {
  if (!num || num < 0) return '0';
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

/**
 * Format duration from milliseconds to HH:MM:SS or MM:SS
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

/**
 * Debounce function execution
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
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
