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
import { SafeStorage } from '../utils/safe-storage.js';

// ====================================================================
// State Management
// ====================================================================

/**
 * Proxy performance statistics
 * Structure: { [proxyName]: { success, fail, lastSuccessTime, totalResponseTime, avgResponseTime } }
 */
let proxyStats = SafeStorage.getJSON('pro_proxy_stats', {});

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

    // Tier priority mapping
    const tierPriority = { 'premium': 1000, 'standard': 500, 'fallback': 100 };

    return [...PROXIES].sort((a, b) => {
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
            ? Math.max(0, 1 - (now - statsA.lastSuccessTime) / (1000 * 60 * 60 * 24)) // 24-hour decay
            : 0;
        const recencyB = statsB.lastSuccessTime > 0
            ? Math.max(0, 1 - (now - statsB.lastSuccessTime) / (1000 * 60 * 60 * 24))
            : 0;

        // 4. Calculate speed score (0-1 range, shorter response time scores higher)
        // Ideal response time: 500ms, >3000ms approaches 0
        const speedA = statsA.avgResponseTime > 0
            ? Math.max(0, 1 - statsA.avgResponseTime / 3000)
            : 0.5; // Default to medium score
        const speedB = statsB.avgResponseTime > 0
            ? Math.max(0, 1 - statsB.avgResponseTime / 3000)
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

        // 7. Smart scoring - multi-dimensional weighted calculation
        // Success rate 40% + Recency 30% + Speed 30%
        const qualityScoreA = (successRateA * 0.4) + (recencyA * 0.3) + (speedA * 0.3);
        const qualityScoreB = (successRateB * 0.4) + (recencyB * 0.3) + (speedB * 0.3);

        // 8. Final score = Tier priority + (Quality score * Geographic weight * 100)
        // Tier is primary factor, quality score is fine-tuning factor
        const finalScoreA = tierScoreA + (qualityScoreA * geoWeightA * 100);
        const finalScoreB = tierScoreB + (qualityScoreB * geoWeightB * 100);

        // Debug logging (optional): Print top 3 proxies' scores
        if (APP_CONFIG.DEBUG.LOG_PERFORMANCE) {
            const rankA = PROXIES.indexOf(a);
            const rankB = PROXIES.indexOf(b);
            if (rankA < 3 || rankB < 3) {
                console.log(`[Proxy Score] ${a.name}: Total ${finalScoreA.toFixed(1)} (Success ${(successRateA*100).toFixed(0)}%, Recency ${(recencyA*100).toFixed(0)}%, Speed ${(speedA*100).toFixed(0)}%)`);
            }
        }

        return finalScoreB - finalScoreA;
    });
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

    // Limit max record count to prevent old data from having too much influence (keep weight of last 100 records)
    const totalRequests = stats.success + stats.fail;
    if (totalRequests > 100) {
        const decay = 0.8;
        stats.success = Math.floor(stats.success * decay);
        stats.fail = Math.floor(stats.fail * decay);
        stats.totalResponseTime = Math.floor(stats.totalResponseTime * decay);
        // avgResponseTime will be recalculated on next success
    }

    SafeStorage.setJSON('pro_proxy_stats', proxyStats);
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
    const did = Signer.getDid();
    const tt = Math.round(Date.now() / 1000);
    const finalUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + `t=${tt}&did=${did}`;

    // Smart direct connection: Try direct connection first under http/https (skip file:// protocol)
    const isDomesticPlatform = targetUrl.includes('bilibili.com') || targetUrl.includes('douyu.com');
    const canTryDirect = (window.location.protocol === 'http:' || window.location.protocol === 'https:') && isDomesticPlatform;

    if (canTryDirect) {
        try {
            console.log('[Proxy Strategy] http/https mode, trying direct connection...');
            const controller = new AbortController();
            const directTimeoutId = setTimeout(() => controller.abort(), 4000); // Quick timeout

            const directRes = await fetch(finalUrl, { signal: controller.signal });
            clearTimeout(directTimeoutId);

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

    console.log('[Proxy Strategy] Using smart proxy pool to fetch data...');

    const smartProxies = getSmartProxyOrder(targetUrl);

    for (const proxy of smartProxies) {
        const startTime = Date.now(); // Record request start time

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const res = await fetch(proxy.url(finalUrl), {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const responseTime = Date.now() - startTime; // Calculate response time

            if (!res.ok) {
                recordProxyResult(proxy.name, false, responseTime);
                continue;
            }

            if (isBinary) {
                recordProxyResult(proxy.name, true, responseTime);
                return await res.blob();
            }

            const raw = await res.json();
            const data = proxy.wrap ? (typeof raw.contents === 'string' ? JSON.parse(raw.contents) : raw.contents) : raw;
            if (data) {
                recordProxyResult(proxy.name, true, responseTime);
                return data;
            }
            recordProxyResult(proxy.name, false, responseTime);
        } catch (e) {
            const responseTime = Date.now() - startTime;
            recordProxyResult(proxy.name, false, responseTime);
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
    const did = Signer.getDid();
    const tt = Math.round(Date.now() / 1000);
    const finalUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + `t=${tt}&did=${did}`;
    const smartProxies = getSmartProxyOrder(targetUrl);
    const bestProxy = smartProxies[0]; // Only use best proxy

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const res = await fetch(bestProxy.url(finalUrl), { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) return null;
        const raw = await res.json();
        return bestProxy.wrap ? (typeof raw.contents === 'string' ? JSON.parse(raw.contents) : raw.contents) : raw;
    } catch (e) { return null; }
}

/**
 * Fetch text content through proxy with automatic failover
 * @param {string} targetUrl - Target URL to fetch
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<string|null>} Fetched text or null on failure
 */
export async function fetchTextWithProxy(targetUrl, timeout = APP_CONFIG.NETWORK.PROXY_TIMEOUT) {
    const did = Signer.getDid();
    const tt = Math.round(Date.now() / 1000);
    const finalUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + `t=${tt}&did=${did}`;
    const smartProxies = getSmartProxyOrder(targetUrl);

    for (const proxy of smartProxies) {
        const startTime = Date.now(); // Record request start time

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const res = await fetch(proxy.url(finalUrl), { signal: controller.signal });
            clearTimeout(timeoutId);

            const responseTime = Date.now() - startTime; // Calculate response time

            if (!res.ok) {
                recordProxyResult(proxy.name, false, responseTime);
                continue;
            }
            const text = await res.text();
            if (text) {
                recordProxyResult(proxy.name, true, responseTime);
                return text;
            }
            recordProxyResult(proxy.name, false, responseTime);
        } catch (e) {
            const responseTime = Date.now() - startTime;
            recordProxyResult(proxy.name, false, responseTime);
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
