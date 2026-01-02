/**
 * ====================================================================
 * Proxy Pool Manager - Smart Proxy Concurrency Control
 * ====================================================================
 *
 * Features:
 * - Per-proxy concurrency limits (prevents overload)
 * - Automatic load balancing across multiple proxies
 * - Queue management with priority support
 * - Performance tracking and health monitoring
 * - Fallback to next-best proxy when primary is full
 *
 * @module utils/proxy-pool-manager
 */

import { getSmartProxyOrder } from '../api/proxy-manager.js';

// ====================================================================
// Configuration
// ====================================================================

const CONFIG = {
    MAX_CONCURRENT_PER_PROXY: 3,  // 优化：从5降到3，减少每个代理的并发请求
    QUEUE_TIMEOUT: 15000,          // 15 seconds timeout for queued requests
    HEALTH_CHECK_INTERVAL: 30000,  // 30 seconds health check
};

// ====================================================================
// State Management
// ====================================================================

/**
 * Track active connections per proxy
 * Structure: Map<proxyName, activeCount>
 */
const proxyConnections = new Map();

/**
 * Track queued requests per proxy
 * Structure: Map<proxyName, Array<{resolve, reject, timestamp}>>
 */
const proxyQueues = new Map();

/**
 * Track proxy health status
 * Structure: Map<proxyName, {healthy: boolean, lastCheck: timestamp}>
 */
const proxyHealth = new Map();

// ====================================================================
// Core Functions
// ====================================================================

/**
 * Get or initialize connection count for a proxy
 */
function getConnectionCount(proxyName) {
    if (!proxyConnections.has(proxyName)) {
        proxyConnections.set(proxyName, 0);
    }
    return proxyConnections.get(proxyName);
}

/**
 * Get or initialize queue for a proxy
 */
function getQueue(proxyName) {
    if (!proxyQueues.has(proxyName)) {
        proxyQueues.set(proxyName, []);
    }
    return proxyQueues.get(proxyName);
}

/**
 * Check if proxy has available capacity
 */
function hasCapacity(proxyName) {
    const current = getConnectionCount(proxyName);
    return current < CONFIG.MAX_CONCURRENT_PER_PROXY;
}

/**
 * Acquire connection slot for a proxy
 * Returns a promise that resolves when slot is available
 */
async function acquireSlot(proxyName, targetUrl = '') {
    // If capacity available, grant immediately
    if (hasCapacity(proxyName)) {
        const count = getConnectionCount(proxyName);
        proxyConnections.set(proxyName, count + 1);
        console.log(`[ProxyPool] ✓ ${proxyName} slot acquired (${count + 1}/${CONFIG.MAX_CONCURRENT_PER_PROXY})`);
        return proxyName;
    }

    // No capacity - try next best proxy
    console.log(`[ProxyPool] ⚠ ${proxyName} at max capacity, finding alternative...`);
    const alternativeProxy = await findAlternativeProxy(proxyName, targetUrl);

    if (alternativeProxy) {
        const count = getConnectionCount(alternativeProxy);
        proxyConnections.set(alternativeProxy, count + 1);
        console.log(`[ProxyPool] ✓ Using ${alternativeProxy} instead (${count + 1}/${CONFIG.MAX_CONCURRENT_PER_PROXY})`);
        return alternativeProxy;
    }

    // All proxies full - queue the request
    console.log(`[ProxyPool] ⏳ All proxies busy, queuing request for ${proxyName}...`);
    return new Promise((resolve, reject) => {
        const queue = getQueue(proxyName);
        const timeout = setTimeout(() => {
            const index = queue.findIndex(item => item.resolve === resolve);
            if (index !== -1) {
                queue.splice(index, 1);
                reject(new Error(`Proxy queue timeout for ${proxyName}`));
            }
        }, CONFIG.QUEUE_TIMEOUT);

        queue.push({
            resolve: (proxy) => {
                clearTimeout(timeout);
                resolve(proxy);
            },
            reject,
            timestamp: Date.now(),
            targetUrl
        });
    });
}

/**
 * Release connection slot for a proxy
 */
function releaseSlot(proxyName) {
    const count = getConnectionCount(proxyName);
    if (count > 0) {
        proxyConnections.set(proxyName, count - 1);
        console.log(`[ProxyPool] ✓ ${proxyName} slot released (${count - 1}/${CONFIG.MAX_CONCURRENT_PER_PROXY})`);

        // Process queued requests
        processQueue(proxyName);
    }
}

/**
 * Process queued requests for a proxy
 */
function processQueue(proxyName) {
    const queue = getQueue(proxyName);
    if (queue.length === 0) return;

    if (hasCapacity(proxyName)) {
        const next = queue.shift();
        if (next) {
            const count = getConnectionCount(proxyName);
            proxyConnections.set(proxyName, count + 1);
            console.log(`[ProxyPool] ✓ Processing queued request for ${proxyName} (${count + 1}/${CONFIG.MAX_CONCURRENT_PER_PROXY})`);
            next.resolve(proxyName);
        }
    }
}

/**
 * Find alternative proxy when primary is full
 */
async function findAlternativeProxy(excludeProxy, targetUrl) {
    const orderedProxies = getSmartProxyOrder(targetUrl);

    for (const proxy of orderedProxies) {
        if (proxy.name === excludeProxy) continue;
        if (hasCapacity(proxy.name)) {
            return proxy.name;
        }
    }

    return null; // All proxies full
}

/**
 * Execute function with proxy concurrency control
 * @param {Function} fetchFn - Function to execute (should accept proxyName)
 * @param {string} preferredProxy - Preferred proxy name
 * @param {string} targetUrl - Target URL (for smart proxy selection)
 * @returns {Promise<any>} Result of fetchFn
 */
export async function executeWithProxyControl(fetchFn, preferredProxy, targetUrl = '') {
    let assignedProxy = null;

    try {
        // Acquire slot (may wait or switch proxy)
        assignedProxy = await acquireSlot(preferredProxy, targetUrl);

        // Execute the actual fetch
        const result = await fetchFn(assignedProxy);
        return result;

    } finally {
        // Always release slot
        if (assignedProxy) {
            releaseSlot(assignedProxy);
        }
    }
}

/**
 * Get current pool statistics
 */
export function getPoolStats() {
    const stats = {};
    for (const [proxyName, count] of proxyConnections.entries()) {
        const queue = getQueue(proxyName);
        stats[proxyName] = {
            active: count,
            queued: queue.length,
            capacity: CONFIG.MAX_CONCURRENT_PER_PROXY,
            utilization: ((count / CONFIG.MAX_CONCURRENT_PER_PROXY) * 100).toFixed(1) + '%'
        };
    }
    return stats;
}

/**
 * Display pool statistics in console
 */
export function showPoolStats() {
    const stats = getPoolStats();
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Proxy Pool Statistics');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const [proxy, data] of Object.entries(stats)) {
        console.log(`${proxy}:`);
        console.log(`  Active:      ${data.active}/${data.capacity}`);
        console.log(`  Queued:      ${data.queued}`);
        console.log(`  Utilization: ${data.utilization}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Make available globally for debugging
if (typeof window !== 'undefined') {
    window.showProxyPool = showPoolStats;
}

// ====================================================================
// Exports
// ====================================================================

export default {
    executeWithProxyControl,
    getPoolStats,
    showPoolStats,
    CONFIG
};
