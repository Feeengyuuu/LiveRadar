/**
 * ============================================================
 * Signer - Device ID management
 * ============================================================
 * Provides access to the device identifier (did) for API requests
 */

import { state } from '../core/state.js';

/**
 * Signer module for accessing device credentials
 */
export const Signer = {
    /**
     * Get the device ID (did)
     * @returns {string} The device identifier
     */
    getDid: () => state.did
};
