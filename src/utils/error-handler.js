/**
 * ====================================================================
 * Enhanced Error Handler
 * ====================================================================
 *
 * Comprehensive error handling with:
 * - Error classification (network, API, parse, timeout)
 * - Retry mechanism with exponential backoff
 * - Circuit breaker pattern for failing services
 * - Error aggregation and reporting
 * - User-friendly error messages
 *
 * @module utils/error-handler
 */

import { Logger } from './logger.js';

const log = Logger.create('ErrorHandler');

// ====================================================================
// Error Types
// ====================================================================

/**
 * Error type enumeration
 * @readonly
 * @enum {string}
 */
export const ErrorType = {
    NETWORK: 'NETWORK',      // Network connectivity issues
    TIMEOUT: 'TIMEOUT',      // Request timeout
    API: 'API',              // API returned error status
    PARSE: 'PARSE',          // JSON/data parsing error
    VALIDATION: 'VALIDATION', // Data validation error
    STORAGE: 'STORAGE',      // localStorage/storage error
    UNKNOWN: 'UNKNOWN'       // Unknown error
};

/**
 * Error severity levels
 * @readonly
 * @enum {string}
 */
export const ErrorSeverity = {
    LOW: 'LOW',         // Can be ignored, logged only
    MEDIUM: 'MEDIUM',   // Should retry, may affect UX
    HIGH: 'HIGH',       // Serious error, needs attention
    CRITICAL: 'CRITICAL' // System failure, needs immediate action
};

// ====================================================================
// Custom Error Classes
// ====================================================================

/**
 * Base application error class
 */
export class AppError extends Error {
    /**
     * @param {string} message - Error message
     * @param {string} type - Error type from ErrorType enum
     * @param {string} severity - Error severity from ErrorSeverity enum
     * @param {Object} [context] - Additional context
     */
    constructor(message, type = ErrorType.UNKNOWN, severity = ErrorSeverity.MEDIUM, context = {}) {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.severity = severity;
        this.context = context;
        this.timestamp = Date.now();
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            type: this.type,
            severity: this.severity,
            context: this.context,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
}

/**
 * Network-specific error
 */
export class NetworkError extends AppError {
    constructor(message, context = {}) {
        super(message, ErrorType.NETWORK, ErrorSeverity.MEDIUM, context);
        this.name = 'NetworkError';
    }
}

/**
 * Timeout-specific error
 */
export class TimeoutError extends AppError {
    constructor(message, context = {}) {
        super(message, ErrorType.TIMEOUT, ErrorSeverity.LOW, context);
        this.name = 'TimeoutError';
    }
}

/**
 * API-specific error
 */
export class APIError extends AppError {
    /**
     * @param {string} message - Error message
     * @param {number} [statusCode] - HTTP status code
     * @param {Object} [context] - Additional context
     */
    constructor(message, statusCode, context = {}) {
        super(message, ErrorType.API, ErrorSeverity.MEDIUM, { ...context, statusCode });
        this.name = 'APIError';
        this.statusCode = statusCode;
    }
}

// ====================================================================
// Circuit Breaker
// ====================================================================

/**
 * Circuit breaker states
 * @readonly
 * @enum {string}
 */
const CircuitState = {
    CLOSED: 'CLOSED',     // Normal operation
    OPEN: 'OPEN',         // Blocking requests
    HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * Circuit breaker for a service
 */
class CircuitBreaker {
    /**
     * @param {string} name - Service name
     * @param {Object} [options] - Configuration options
     */
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold || 5;
        this.successThreshold = options.successThreshold || 2;
        this.timeout = options.timeout || 30000; // 30 seconds

        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.nextAttemptTime = 0;
    }

    /**
     * Check if request should be allowed
     * @returns {boolean} True if request is allowed
     */
    canRequest() {
        if (this.state === CircuitState.CLOSED) {
            return true;
        }

        if (this.state === CircuitState.OPEN) {
            if (Date.now() >= this.nextAttemptTime) {
                this.state = CircuitState.HALF_OPEN;
                return true;
            }
            return false;
        }

        // HALF_OPEN - allow limited requests
        return true;
    }

    /**
     * Record successful request
     */
    recordSuccess() {
        if (this.state === CircuitState.HALF_OPEN) {
            this.successes++;
            if (this.successes >= this.successThreshold) {
                this.reset();
            }
        } else {
            this.failures = 0;
        }
    }

    /**
     * Record failed request
     */
    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();

        if (this.state === CircuitState.HALF_OPEN) {
            this.trip();
        } else if (this.failures >= this.failureThreshold) {
            this.trip();
        }
    }

    /**
     * Trip the circuit breaker to OPEN state
     */
    trip() {
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = Date.now() + this.timeout;
        log.warn(`Circuit breaker [${this.name}] tripped - will retry at ${new Date(this.nextAttemptTime).toISOString()}`);
    }

    /**
     * Reset circuit breaker to CLOSED state
     */
    reset() {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        log.info(`Circuit breaker [${this.name}] reset to CLOSED`);
    }

    /**
     * Get current state
     * @returns {Object} Current state info
     */
    getState() {
        return {
            name: this.name,
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            lastFailureTime: this.lastFailureTime
        };
    }
}

// Circuit breakers registry
const circuitBreakers = new Map();

/**
 * Get or create circuit breaker for a service
 * @param {string} name - Service name
 * @param {Object} [options] - Configuration options
 * @returns {CircuitBreaker} Circuit breaker instance
 */
export function getCircuitBreaker(name, options = {}) {
    if (!circuitBreakers.has(name)) {
        circuitBreakers.set(name, new CircuitBreaker(name, options));
    }
    return circuitBreakers.get(name);
}

// ====================================================================
// Retry Mechanism
// ====================================================================

/**
 * Retry configuration
 * @typedef {Object} RetryConfig
 * @property {number} [maxRetries=3] - Maximum retry attempts
 * @property {number} [baseDelay=1000] - Base delay in ms
 * @property {number} [maxDelay=10000] - Maximum delay in ms
 * @property {number} [backoffFactor=2] - Exponential backoff factor
 * @property {Function} [shouldRetry] - Custom retry condition
 * @property {Function} [onRetry] - Callback on each retry
 */

/**
 * Execute function with retry logic
 * @param {Function} fn - Async function to execute
 * @param {RetryConfig} [config] - Retry configuration
 * @returns {Promise<*>} Result of successful execution
 * @throws {Error} Final error after all retries exhausted
 *
 * @example
 * const result = await retry(
 *   () => fetchData(url),
 *   { maxRetries: 3, baseDelay: 1000 }
 * );
 */
export async function retry(fn, config = {}) {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 10000,
        backoffFactor = 2,
        shouldRetry = () => true,
        onRetry = () => {}
    } = config;

    let lastError;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            return await fn(attempt);
        } catch (error) {
            lastError = error;
            attempt++;

            // Check if we should retry
            if (attempt > maxRetries || !shouldRetry(error, attempt)) {
                break;
            }

            // Calculate delay with exponential backoff and jitter
            const exponentialDelay = baseDelay * Math.pow(backoffFactor, attempt - 1);
            const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
            const delay = Math.min(exponentialDelay + jitter, maxDelay);

            log.debug(`Retry attempt ${attempt}/${maxRetries} after ${Math.round(delay)}ms`, { error: error.message });

            // Notify callback
            onRetry(error, attempt, delay);

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Determine if error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if error can be retried
 */
export function isRetryableError(error) {
    // Network errors are retryable
    if (error instanceof NetworkError || error instanceof TimeoutError) {
        return true;
    }

    // API errors - only retry on server errors (5xx) or rate limiting (429)
    if (error instanceof APIError) {
        const status = error.statusCode;
        return status >= 500 || status === 429 || status === 408;
    }

    // Check native error types
    if (error.name === 'AbortError' || error.name === 'TypeError') {
        return true;
    }

    return false;
}

// ====================================================================
// Error Aggregation
// ====================================================================

/**
 * Error statistics tracker
 */
const errorStats = {
    counts: {},
    recent: [],
    maxRecent: 50
};

/**
 * Track error occurrence
 * @param {Error} error - Error to track
 * @param {string} [context] - Error context
 */
function trackError(error, context = '') {
    const type = error.type || ErrorType.UNKNOWN;
    const key = `${type}:${context}`;

    // Update counts
    errorStats.counts[key] = (errorStats.counts[key] || 0) + 1;

    // Add to recent errors
    errorStats.recent.push({
        timestamp: Date.now(),
        type,
        context,
        message: error.message,
        severity: error.severity || ErrorSeverity.MEDIUM
    });

    // Trim recent errors
    if (errorStats.recent.length > errorStats.maxRecent) {
        errorStats.recent.shift();
    }
}

/**
 * Get error statistics
 * @returns {Object} Error statistics
 */
export function getErrorStats() {
    return {
        counts: { ...errorStats.counts },
        recent: [...errorStats.recent],
        summary: {
            total: Object.values(errorStats.counts).reduce((a, b) => a + b, 0),
            byType: Object.entries(errorStats.counts).reduce((acc, [key, count]) => {
                const type = key.split(':')[0];
                acc[type] = (acc[type] || 0) + count;
                return acc;
            }, {})
        }
    };
}

/**
 * Clear error statistics
 */
export function clearErrorStats() {
    errorStats.counts = {};
    errorStats.recent = [];
}

// ====================================================================
// User-Friendly Messages
// ====================================================================

/**
 * Error message translations (Chinese)
 */
const ERROR_MESSAGES = {
    [ErrorType.NETWORK]: '网络连接失败，请检查网络设置',
    [ErrorType.TIMEOUT]: '请求超时，服务器响应较慢',
    [ErrorType.API]: '服务器返回错误，请稍后重试',
    [ErrorType.PARSE]: '数据解析失败',
    [ErrorType.VALIDATION]: '数据格式不正确',
    [ErrorType.STORAGE]: '本地存储失败',
    [ErrorType.UNKNOWN]: '发生未知错误'
};

/**
 * Get user-friendly error message
 * @param {Error} error - Error object
 * @returns {string} User-friendly message
 */
export function getUserFriendlyMessage(error) {
    if (error instanceof AppError) {
        return ERROR_MESSAGES[error.type] || ERROR_MESSAGES[ErrorType.UNKNOWN];
    }

    // Check for common error patterns
    if (error.name === 'AbortError') {
        return ERROR_MESSAGES[ErrorType.TIMEOUT];
    }

    if (error.message?.includes('fetch') || error.message?.includes('network')) {
        return ERROR_MESSAGES[ErrorType.NETWORK];
    }

    return ERROR_MESSAGES[ErrorType.UNKNOWN];
}

// ====================================================================
// Main Error Handler
// ====================================================================

/**
 * Unified error handler
 */
export const ErrorHandler = {
    /**
     * Log error with context information
     * @param {Error|string} error - Error object or message
     * @param {string} context - Context where error occurred
     */
    log(error, context = '') {
        const appError = error instanceof AppError ? error : this.classify(error, context);
        trackError(appError, context);
        log.error(`[${context}]`, appError.message, appError.context);
    },

    /**
     * Handle error and return fallback value
     * @param {Error|string} error - Error object or message
     * @param {string} context - Context where error occurred
     * @param {*} fallback - Fallback value to return
     * @returns {*} Fallback value
     */
    handle(error, context = '', fallback = null) {
        this.log(error, context);
        return fallback;
    },

    /**
     * Silent error handling (only logs in development mode)
     * @param {Error|string} error - Error object or message
     * @param {string} context - Context where error occurred
     */
    silent(error, context = '') {
        if (import.meta.env?.DEV) {
            this.log(error, context);
        }
    },

    /**
     * Classify a native error into AppError
     * @param {Error} error - Native error
     * @param {string} [context] - Error context
     * @returns {AppError} Classified error
     */
    classify(error, context = '') {
        if (error instanceof AppError) {
            return error;
        }

        // Timeout errors
        if (error.name === 'AbortError') {
            return new TimeoutError(error.message || 'Request timeout', { context });
        }

        // Network errors
        if (error.name === 'TypeError' && error.message?.includes('fetch')) {
            return new NetworkError(error.message, { context });
        }

        // JSON parse errors
        if (error instanceof SyntaxError) {
            return new AppError(error.message, ErrorType.PARSE, ErrorSeverity.MEDIUM, { context });
        }

        // Default to unknown
        return new AppError(
            error.message || String(error),
            ErrorType.UNKNOWN,
            ErrorSeverity.MEDIUM,
            { context, originalError: error.name }
        );
    },

    /**
     * Wrap async function with error handling
     * @param {Function} fn - Async function to wrap
     * @param {string} context - Error context
     * @param {*} [fallback=null] - Fallback value on error
     * @returns {Function} Wrapped function
     */
    wrap(fn, context, fallback = null) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                return this.handle(error, context, fallback);
            }
        };
    },

    /**
     * Execute with retry and circuit breaker
     * @param {Function} fn - Async function to execute
     * @param {Object} options - Options
     * @param {string} options.service - Service name for circuit breaker
     * @param {string} options.context - Error context
     * @param {RetryConfig} [options.retry] - Retry configuration
     * @returns {Promise<*>} Result or null on failure
     */
    async executeWithProtection(fn, options = {}) {
        const { service, context, retry: retryConfig = {} } = options;

        // Check circuit breaker if service specified
        if (service) {
            const breaker = getCircuitBreaker(service);
            if (!breaker.canRequest()) {
                log.debug(`Circuit breaker [${service}] is OPEN - request blocked`);
                return null;
            }
        }

        try {
            const result = await retry(fn, {
                ...retryConfig,
                shouldRetry: isRetryableError
            });

            // Record success
            if (service) {
                getCircuitBreaker(service).recordSuccess();
            }

            return result;
        } catch (error) {
            // Record failure
            if (service) {
                getCircuitBreaker(service).recordFailure();
            }

            return this.handle(error, context, null);
        }
    },

    // Expose utilities
    ErrorType,
    ErrorSeverity,
    AppError,
    NetworkError,
    TimeoutError,
    APIError,
    retry,
    isRetryableError,
    getCircuitBreaker,
    getErrorStats,
    clearErrorStats,
    getUserFriendlyMessage
};

export default ErrorHandler;
