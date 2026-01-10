/**
 * ====================================================================
 * Proxy Manager - Smart Proxy Selection with Multi-Tier Failover
 * ====================================================================
 *
 * Features:
 * - Multi-tier proxy failover strategy (premium/standard/fallback)
 * - Response time tracking and performance-based selection
 * - Geographic routing optimization
 * - Success rate calculation with time decay
 * - Automatic proxy health monitoring
 *
 * @module api/proxy-manager
 */

import { APP_CONFIG } from '../config/constants.js';
import { PROXIES } from '../config/proxies.js';
import { Signer } from '../config/signer.js';
import { getState, updateProxyStats } from '../core/state.js';
import { executeWithProxyControl } from '../utils/proxy-pool-manager.js';

// ====================================================================
// State Management
// ====================================================================

/**
 * Proxy performance statistics
 * Structure: { [proxyName]: { success, fail, lastSuccessTime, totalResponseTime, avgResponseTime } }
 */
const proxyStats = getState().proxyStats || {};
let proxyStatsVersion = 0;
const proxyOrderCache = {
    key: '',
    version: -1,
    timestamp: 0,
    list: null
};
const PROXY_ORDER_CACHE_TTL = 2000;

// ====================================================================
// Helper Functions - 提取重复代码
// ====================================================================

/**
 * Build final URL with authentication parameters
 * @param {string} targetUrl - Original target URL
 * @returns {string} URL with appended auth parameters
 */
function buildAuthenticatedUrl(targetUrl) {
    const did = Signer.getDid();
    const tt = Math.round(Date.now() / 1000);
    const separator = targetUrl.includes('?') ? '&' : '?';
    return `${targetUrl}${separator}t=${tt}&did=${did}`;
}

/**
 * Create an AbortController with timeout
 * @param {number} timeout - Timeout in milliseconds
 * @param {AbortSignal} [externalSignal] - Optional external abort signal
 * @returns {{controller: AbortController, timeoutId: number, clear: Function}}
 */
function createTimeoutController(timeout, externalSignal) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort();
        } else {
            externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }
    }
    return {
        controller,
        timeoutId,
        signal: controller.signal,
        clear: () => clearTimeout(timeoutId)
    };
}

/**
 * Resolve on first fulfilled promise (Promise.any fallback).
 * @param {Promise[]} promises - Promises to race
 * @returns {Promise<any>} First fulfilled value
 */
function promiseAny(promises) {
    if (typeof Promise.any === 'function') return Promise.any(promises);
    return new Promise((resolve, reject) => {
        const errors = [];
        let pending = promises.length;
        if (pending === 0) {
            const error = new Error('All promises were rejected');
            error.errors = errors;
            reject(error);
            return;
        }
        promises.forEach((promise, index) => {
            Promise.resolve(promise).then(resolve).catch((err) => {
                errors[index] = err;
                pending -= 1;
                if (pending === 0) {
                    const error = new Error('All promises were rejected');
                    error.errors = errors;
                    reject(error);
                }
            });
        });
    });
}

// ====================================================================
// Smart Proxy Selection
// ====================================================================

/**
 * Get smart-ordered proxy list based on multiple factors
 * @param {string} targetUrl - Target URL for geographic optimization
 * @returns {Array} Sorted proxy array (best to worst)
 */
export function getSmartProxyOrder(targetUrl = '') {
    const userIsMainland = APP_CONFIG.REGION.IS_MAINLAND_CHINA === true;
    const isDomesticTarget = targetUrl && (targetUrl.includes('bilibili.com') || targetUrl.includes('douyu.com'));
    const now = Date.now();
    const cacheKey = `${userIsMainland ? 'CN' : 'INTL'}|${isDomesticTarget ? 'dom' : 'intl'}`;

    if (
        proxyOrderCache.list &&
        proxyOrderCache.key === cacheKey &&
        proxyOrderCache.version === proxyStatsVersion &&
        (now - proxyOrderCache.timestamp) < PROXY_ORDER_CACHE_TTL
    ) {
        return proxyOrderCache.list.slice();
    }

    // Use configured tier priorities
    const tierPriority = APP_CONFIG.PROXY_SCORING.TIER_PRIORITY;
    const recencyDecayMs = APP_CONFIG.PROXY_SCORING.RECENCY_DECAY_HOURS * 60 * 60 * 1000;
    const speedThreshold = APP_CONFIG.PROXY_SCORING.SPEED_THRESHOLD_MS;
    const indexMap = new Map(PROXIES.map((proxy, index) => [proxy.name, index]));

    const ordered = [...PROXIES].sort((a, b) => {
        // 1. Get statistics data
        const statsA = proxyStats[a.name] || { success: 0, fail: 0, lastSuccessTime: 0, avgResponseTime: 0 };
        const statsB = proxyStats[b.name] || { success: 0, fail: 0, lastSuccessTime: 0, avgResponseTime: 0 };

        // 2. Calculate success rate (0-1 range)
        const totalA = statsA.success + statsA.fail;
        const totalB = statsB.success + statsB.fail;
        const successRateA = totalA > 0 ? statsA.success / totalA : 0.5; // Default to medium score
        const successRateB = totalB > 0 ? statsB.success / totalB : 0.5;

        // 3. Calculate recency score (0-1 range, recent success scores higher)
        const recencyA = statsA.lastSuccessTime > 0
            ? Math.max(0, 1 - (now - statsA.lastSuccessTime) / recencyDecayMs)
            : 0;
        const recencyB = statsB.lastSuccessTime > 0
            ? Math.max(0, 1 - (now - statsB.lastSuccessTime) / recencyDecayMs)
            : 0;

        // 4. Calculate speed score (0-1 range, shorter response time scores higher)
        const speedA = statsA.avgResponseTime > 0
            ? Math.max(0, 1 - statsA.avgResponseTime / speedThreshold)
            : 0.5; // Default to medium score
        const speedB = statsB.avgResponseTime > 0
            ? Math.max(0, 1 - statsB.avgResponseTime / speedThreshold)
            : 0.5;

        // 5. Geographic weight adjustment
        let geoWeightA = a.weight || 1;
        let geoWeightB = b.weight || 1;

        // If user is in mainland, prioritize mainland proxies (if available)
        if (userIsMainland) {
            if (a.region === 'mainland') geoWeightA *= 3;
            if (b.region === 'mainland') geoWeightB *= 3;
        }

        // 6. Tier priority boost
        const tierScoreA = tierPriority[a.tier] || 0;
        const tierScoreB = tierPriority[b.tier] || 0;

        // 7. Smart scoring - multi-dimensional weighted calculation (configurable weights)
        const { SUCCESS_RATE_WEIGHT, RECENCY_WEIGHT, SPEED_WEIGHT, QUALITY_SCORE_MULTIPLIER } = APP_CONFIG.PROXY_SCORING;
        const qualityScoreA = (successRateA * SUCCESS_RATE_WEIGHT) + (recencyA * RECENCY_WEIGHT) + (speedA * SPEED_WEIGHT);
        const qualityScoreB = (successRateB * SUCCESS_RATE_WEIGHT) + (recencyB * RECENCY_WEIGHT) + (speedB * SPEED_WEIGHT);

        // 8. Final score = Tier priority + (Quality score * Geographic weight * multiplier)
        // Tier is primary factor, quality score is fine-tuning factor
        const finalScoreA = tierScoreA + (qualityScoreA * geoWeightA * QUALITY_SCORE_MULTIPLIER);
        const finalScoreB = tierScoreB + (qualityScoreB * geoWeightB * QUALITY_SCORE_MULTIPLIER);

        // Debug logging (optional): Print top 3 proxies' scores
        if (APP_CONFIG.DEBUG.LOG_PERFORMANCE) {
            const rankA = indexMap.get(a.name) ?? 0;
            const rankB = indexMap.get(b.name) ?? 0;
            if (rankA < 3 || rankB < 3) {
                console.log(`[Proxy Score] ${a.name}: Total ${finalScoreA.toFixed(1)} (Success ${(successRateA*100).toFixed(0)}%, Recency ${(recencyA*100).toFixed(0)}%, Speed ${(speedA*100).toFixed(0)}%)`);
            }
        }

        return finalScoreB - finalScoreA;
    });

    proxyOrderCache.key = cacheKey;
    proxyOrderCache.version = proxyStatsVersion;
    proxyOrderCache.timestamp = now;
    proxyOrderCache.list = ordered;

    return ordered.slice();
}

/**
 * Record proxy request result
 * @param {string} proxyName - Proxy name
 * @param {boolean} success - Whether request succeeded
 * @param {number|null} responseTime - Response time in milliseconds
 */
export function recordProxyResult(proxyName, success, responseTime = null) {
    // Initialize statistics data structure
    if (!proxyStats[proxyName]) {
        proxyStats[proxyName] = {
            success: 0,
            fail: 0,
            lastSuccessTime: 0,
            totalResponseTime: 0,
            avgResponseTime: 0
        };
    }

    const stats = proxyStats[proxyName];

    // Update success/failure count
    if (success) {
        stats.success++;
        stats.lastSuccessTime = Date.now(); // Record last success time

        // Update response time statistics
        if (responseTime !== null && responseTime > 0) {
            stats.totalResponseTime += responseTime;
            stats.avgResponseTime = stats.totalResponseTime / stats.success;
        }
    } else {
        stats.fail++;
    }

    // Limit max record count to prevent old data from having too much influence
    const totalRequests = stats.success + stats.fail;
    if (totalRequests > APP_CONFIG.NETWORK.MAX_PROXY_STATS) {
        const decay = 0.8;
        stats.success = Math.floor(stats.success * decay);
        stats.fail = Math.floor(stats.fail * decay);
        stats.totalResponseTime = Math.floor(stats.totalResponseTime * decay);
        // avgResponseTime will be recalculated on next success
    }

    proxyStatsVersion++;
    updateProxyStats(proxyStats);
}

// ====================================================================
// Proxy Fetching Functions
// ====================================================================

/**
 * Fetch data through proxy with automatic failover
 * @param {string} targetUrl - Target URL to fetch
 * @param {boolean} isBinary - Whether to expect binary data
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object|Blob|null>} Fetched data or null on failure
 */
export async function fetchWithProxy(targetUrl, isBinary = false, timeout = APP_CONFIG.NETWORK.PROXY_TIMEOUT) {
    const finalUrl = buildAuthenticatedUrl(targetUrl);

    // Smart direct connection: Try direct connection first under http/https (skip file:// protocol)
    const isDomesticPlatform = targetUrl.includes('bilibili.com') || targetUrl.includes('douyu.com');
    const canTryDirect = (window.location.protocol === 'http:' || window.location.protocol === 'https:') && isDomesticPlatform;

    if (canTryDirect) {
        try {
            console.log('[Proxy Strategy] http/https mode, trying direct connection...');
            const timeoutCtrl = createTimeoutController(APP_CONFIG.NETWORK.PROXY_TIMEOUT_DIRECT);

            const directRes = await fetch(finalUrl, { signal: timeoutCtrl.signal });
            timeoutCtrl.clear();

            if (directRes.ok) {
                if (isBinary) {
                    console.log('[Proxy Strategy] ✓ Direct connection successful (binary data)');
                    return await directRes.blob();
                }
                const data = await directRes.json();
                if (data) {
                    console.log('[Proxy Strategy] ✓ Direct connection successful');
                    return data;
                }
            }
        } catch (e) {
            console.log('[Proxy Strategy] Direct connection failed, using proxy pool:', e.message);
        }
    }

    console.log('[Proxy Strategy] Using smart proxy pool with concurrency control...');

    const smartProxies = getSmartProxyOrder(targetUrl);
    if (smartProxies.length === 0) return null;

    const attemptProxy = (proxy, abortSignal) => executeWithProxyControl(
        async (assignedProxyName) => {
            const startTime = Date.now();

            // Find the assigned proxy config
            const assignedProxy = PROXIES.find(p => p.name === assignedProxyName);
            if (!assignedProxy) throw new Error(`Proxy ${assignedProxyName} not found`);

            const timeoutCtrl = createTimeoutController(timeout, abortSignal);

            try {
                const res = await fetch(assignedProxy.url(finalUrl), {
                    signal: timeoutCtrl.signal
                });
                timeoutCtrl.clear();

                const responseTime = Date.now() - startTime;

                if (!res.ok) {
                    recordProxyResult(assignedProxy.name, false, responseTime);
                    throw new Error(`HTTP ${res.status}`);
                }

                if (isBinary) {
                    recordProxyResult(assignedProxy.name, true, responseTime);
                    return await res.blob();
                }

                let data = null;
                try {
                    const raw = await res.json();
                    data = assignedProxy.wrap
                        ? (typeof raw.contents === 'string' ? JSON.parse(raw.contents) : raw.contents)
                        : raw;
                } catch (parseError) {
                    recordProxyResult(assignedProxy.name, false, responseTime);
                    throw parseError;
                }

                if (data) {
                    recordProxyResult(assignedProxy.name, true, responseTime);
                    return data;
                }
                recordProxyResult(assignedProxy.name, false, responseTime);
                throw new Error('Empty data');
            } catch (err) {
                timeoutCtrl.clear();
                throw err;
            }
        },
        proxy.name,
        targetUrl
    );

    const hedgeEnabled = APP_CONFIG.NETWORK.HEDGE_REQUESTS_ENABLED && smartProxies.length > 1;
    let startIndex = 0;

    if (hedgeEnabled) {
        const primary = smartProxies[0];
        const secondary = smartProxies[1];
        const primaryAbort = new AbortController();
        const secondaryAbort = new AbortController();
        let secondaryStarted = false;
        let secondaryTimer = null;
        let startSecondary = null;

        const secondaryPromise = new Promise((resolve, reject) => {
            const begin = () => {
                if (secondaryStarted) return;
                secondaryStarted = true;
                if (secondaryTimer) clearTimeout(secondaryTimer);
                attemptProxy(secondary, secondaryAbort.signal)
                    .then((data) => resolve({ source: 'secondary', data }))
                    .catch(reject);
            };
            startSecondary = begin;
            secondaryTimer = setTimeout(begin, APP_CONFIG.NETWORK.HEDGE_DELAY_MS);
            secondaryAbort.signal.addEventListener('abort', () => {
                if (secondaryTimer) clearTimeout(secondaryTimer);
                reject(new Error('Aborted'));
            }, { once: true });
        });

        const primaryPromise = attemptProxy(primary, primaryAbort.signal)
            .then((data) => ({ source: 'primary', data }))
            .catch((err) => {
                if (startSecondary) startSecondary();
                throw err;
            });

        try {
            const result = await promiseAny([
                primaryPromise,
                secondaryPromise
            ]);
            if (result.source === 'primary') {
                secondaryAbort.abort();
            } else {
                primaryAbort.abort();
            }
            return result.data;
        } catch (e) {
            startIndex = 2;
        }
    }

    for (let i = startIndex; i < smartProxies.length; i++) {
        const proxy = smartProxies[i];
        try {
            const result = await attemptProxy(proxy);

            // If we got a result, return it
            if (result) {
                return result;
            }
        } catch (e) {
            // Error already handled inside executeWithProxyControl
            console.warn(`[Proxy] ${proxy.name} failed:`, e.message);
            continue;
        }
    }
    return null;
}

/**
 * Quick fetch - Single proxy attempt for non-critical data
 * @param {string} targetUrl - Target URL to fetch
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object|null>} Fetched data or null on failure
 */
export async function fetchQuick(targetUrl, timeout = APP_CONFIG.NETWORK.PROXY_TIMEOUT_QUICK) {
    const finalUrl = buildAuthenticatedUrl(targetUrl);
    const smartProxies = getSmartProxyOrder(targetUrl);
    if (smartProxies.length === 0) return null;
    const bestProxy = smartProxies[0]; // Only use best proxy

    const startTime = Date.now();
    try {
        const timeoutCtrl = createTimeoutController(timeout);
        const res = await fetch(bestProxy.url(finalUrl), { signal: timeoutCtrl.signal });
        timeoutCtrl.clear();
        const responseTime = Date.now() - startTime;
        if (!res.ok) {
            recordProxyResult(bestProxy.name, false, responseTime);
            return null;
        }
        let data = null;
        try {
            const raw = await res.json();
            data = bestProxy.wrap
                ? (typeof raw.contents === 'string' ? JSON.parse(raw.contents) : raw.contents)
                : raw;
        } catch (parseError) {
            recordProxyResult(bestProxy.name, false, responseTime);
            return null;
        }
        if (data) {
            recordProxyResult(bestProxy.name, true, responseTime);
            return data;
        }
        recordProxyResult(bestProxy.name, false, responseTime);
        return null;
    } catch (e) {
        const responseTime = Date.now() - startTime;
        recordProxyResult(bestProxy.name, false, responseTime);
        return null;
    }
}

/**
 * Fetch text content through proxy with automatic failover
 * @param {string} targetUrl - Target URL to fetch
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<string|null>} Fetched text or null on failure
 */
export async function fetchTextWithProxy(targetUrl, timeout = APP_CONFIG.NETWORK.PROXY_TIMEOUT) {
    const finalUrl = buildAuthenticatedUrl(targetUrl);
    const smartProxies = getSmartProxyOrder(targetUrl);

    for (const proxy of smartProxies) {
        try {
            const result = await executeWithProxyControl(
                async (assignedProxyName) => {
                    const startTime = Date.now();
                    const assignedProxy = PROXIES.find(p => p.name === assignedProxyName);
                    if (!assignedProxy) throw new Error(`Proxy ${assignedProxyName} not found`);

                    const timeoutCtrl = createTimeoutController(timeout);
                    try {
                        const res = await fetch(assignedProxy.url(finalUrl), { signal: timeoutCtrl.signal });
                        timeoutCtrl.clear();

                        const responseTime = Date.now() - startTime;

                        if (!res.ok) {
                            recordProxyResult(assignedProxy.name, false, responseTime);
                            throw new Error(`HTTP ${res.status}`);
                        }
                        const text = await res.text();
                        if (text) {
                            recordProxyResult(assignedProxy.name, true, responseTime);
                            return text;
                        }
                        recordProxyResult(assignedProxy.name, false, responseTime);
                        throw new Error('Empty text');
                    } catch (err) {
                        timeoutCtrl.clear();
                        throw err;
                    }
                },
                proxy.name,
                targetUrl
            );

            if (result) {
                return result;
            }
        } catch (e) {
            console.warn(`[Proxy] ${proxy.name} failed:`, e.message);
            continue;
        }
    }
    return null;
}

// ====================================================================
// Export Proxy Manager Object
// ====================================================================

export const ProxyManager = {
    getSmartProxyOrder,
    recordProxyResult,
    fetchWithProxy,
    fetchQuick,
    fetchTextWithProxy,
    getStats: () => proxyStats
};
