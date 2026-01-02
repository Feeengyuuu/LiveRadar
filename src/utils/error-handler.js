/**
 * Error Handler - Unified error handling utility
 * Provides consistent error logging and handling across the application
 */

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
        const timestamp = new Date().toISOString();
        const errorMessage = error?.message || error;
        console.error(`[${context}] ${timestamp}`, errorMessage, error);
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
        if (import.meta.env.DEV) {
            this.log(error, context);
        }
    }
};
