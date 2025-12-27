/**
 * ============================================================
 * PROXY POOL - Optimized CORS proxy configuration
 * ============================================================
 *
 * Proxy Tiers:
 * - 'premium': Premium tier (first choice, high priority)
 * - 'standard': Standard tier (second choice)
 * - 'fallback': Fallback tier (last resort)
 *
 * Regions:
 * - 'overseas': Overseas proxy
 * - 'mainland': Mainland China proxy
 * - 'global': Global availability
 *
 * Notes:
 * - wrap: true indicates data needs to be extracted from response.contents
 * - Under file:// protocol, only CodeTabs is available
 * - Under http:// protocol, other proxies can serve as fallbacks
 */

/**
 * Available CORS proxy services
 * Each proxy has: name, url function, wrap flag, weight, region, and tier
 */
export const PROXIES = [
    // === Premium Tier (Tier 1): Available under file:// protocol ===
    {
        name: "CodeTabs",
        url: u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        wrap: false,
        weight: 50,
        region: 'overseas',
        tier: 'premium'
    },

    // === New Proxies (Tier 1): To be verified ===
    {
        name: "AllOrigins-ML",
        url: u => `https://api.allorigins.ml/get?url=${encodeURIComponent(u)}`,
        wrap: true,
        weight: 25,
        region: 'overseas',
        tier: 'premium'
    },
    {
        name: "HTMLDriven",
        url: u => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(u)}`,
        wrap: false,
        weight: 20,
        region: 'overseas',
        tier: 'premium'
    },
    {
        name: "WhateverOrigin",
        url: u => `https://whateverorigin.herokuapp.com/get?url=${encodeURIComponent(u)}`,
        wrap: true,
        weight: 15,
        region: 'overseas',
        tier: 'premium'
    },

    // === Standard Tier (Tier 2): HTTP fallback ===
    {
        name: "CORS.IO",
        url: u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        wrap: false,
        weight: 12,
        region: 'overseas',
        tier: 'standard'
    },
    {
        name: "AllOrigins",
        url: u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
        wrap: true,
        weight: 10,
        region: 'overseas',
        tier: 'standard'
    },
    {
        name: "CORS-EU",
        url: u => `https://cors.eu.org/?${encodeURIComponent(u)}`,
        wrap: false,
        weight: 8,
        region: 'overseas',
        tier: 'standard'
    },

    // === Fallback Tier (Tier 3): Last resort ===
    {
        name: "ThingProxy",
        url: u => `https://thingproxy.freeboard.io/fetch/${u}`,
        wrap: false,
        weight: 5,
        region: 'overseas',
        tier: 'fallback'
    },
    {
        name: "Proxy.CORS",
        url: u => `https://proxy.cors.sh/${u}`,
        wrap: false,
        weight: 3,
        region: 'overseas',
        tier: 'fallback'
    },
    {
        name: "CORS-Anywhere",
        url: u => `https://cors-anywhere.herokuapp.com/${u}`,
        wrap: false,
        weight: 2,
        region: 'overseas',
        tier: 'fallback'
    }

    // TODO: Add mainland China proxies if discovered:
    // { name: "国内代理1", url: u => `...`, wrap: false, weight: 60, region: 'mainland', tier: 'premium' },
];

/**
 * Proxy configuration object
 */
export const PROXY_CONFIG = {
    PROXIES,
    DEFAULT_TIMEOUT: 8000,
    MAX_RETRIES: 3
};
