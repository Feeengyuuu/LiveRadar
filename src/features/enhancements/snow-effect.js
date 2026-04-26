/**
 * Snow Effect Module - Complete implementation based on original LiveRadar
 * Features: Physics-based accumulation, card collision, hover-triggered falling
 */

import { isSnowEnabled, updateSnowEnabled } from '../../core/state.js';
import { showToast } from '../../utils/helpers.js';

function getViewportWidth() {
    return typeof window === 'undefined' ? 1024 : window.innerWidth;
}

function getDeviceMemory() {
    if (typeof navigator === 'undefined') return 4;
    return Number(navigator.deviceMemory) || 4;
}

function getHardwareConcurrency() {
    if (typeof navigator === 'undefined') return 4;
    return Number(navigator.hardwareConcurrency) || 4;
}

function prefersReducedMotion() {
    return Boolean(
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
}

function getPreferredSnowflakeCount() {
    const viewportWidth = getViewportWidth();
    const isMobile = viewportWidth < 768;
    const isLowPowerDevice = getDeviceMemory() <= 2 || getHardwareConcurrency() <= 2;

    if (prefersReducedMotion()) {
        return isMobile ? 12 : 24;
    }

    if (isLowPowerDevice) {
        return isMobile ? 16 : 48;
    }

    if (isMobile) {
        return 28;
    }

    if (viewportWidth < 1200) {
        return 80;
    }

    return 140;
}

// ========================================
// Configuration (aligned with original file)
// ========================================
const CONFIG = {
    ENABLED: isSnowEnabled(),        // 默认关闭，状态统一由 state.js 恢复
    COUNT: getPreferredSnowflakeCount(),
    MAX_SIZE: 14,                   // Maximum logo size (pixels)
    MIN_SIZE: 7,                    // Minimum logo size (pixels)
    MAX_SPEED: 1.2,                 // Maximum fall speed
    MIN_SPEED: 0.3,                 // Minimum fall speed
    MAX_ACCUMULATED: 12,            // Max accumulated snowflakes per card
    FALL_SPEED_BOOST: 1.5,          // Fall acceleration multiplier
    ACCUMULATED_SIZE_MULT: 1.3,     // Accumulated snowflake size multiplier
    COLLISION_OFFSET: 5,            // Collision detection offset (pixels)
    POSITION_UPDATE_INTERVAL: 100,  // Card position update interval (ms)
};

const PLATFORM_LOGO_MARKS = [
    {
        name: 'douyu',
        facets: [
            { fill: '#ff7a1a', points: [[-0.48, -0.1], [-0.12, -0.42], [0.34, -0.28], [0.48, 0.08], [0.1, 0.42], [-0.38, 0.32]] },
            { fill: '#ff4f12', points: [[-0.48, -0.1], [-0.68, -0.34], [-0.58, 0.04], [-0.38, 0.32]] },
            { fill: '#ff9b37', points: [[-0.12, -0.42], [0.34, -0.28], [0.08, -0.02], [-0.34, 0.02]] },
            { fill: '#ffe4c3', points: [[0.18, -0.12], [0.31, -0.08], [0.27, 0.04], [0.14, 0.02]] }
        ]
    },
    {
        name: 'bilibili',
        facets: [
            { fill: '#fb7299', points: [[-0.48, -0.28], [0.48, -0.28], [0.42, 0.36], [-0.42, 0.36]] },
            { fill: '#ff9fbe', points: [[-0.34, -0.42], [-0.18, -0.28], [-0.1, -0.28], [-0.26, -0.5]] },
            { fill: '#ff9fbe', points: [[0.1, -0.28], [0.18, -0.28], [0.34, -0.42], [0.26, -0.5]] },
            { fill: '#ffd5e3', points: [[-0.22, -0.04], [-0.06, -0.04], [-0.08, 0.1], [-0.24, 0.1]] },
            { fill: '#ffd5e3', points: [[0.08, -0.04], [0.24, -0.04], [0.22, 0.1], [0.06, 0.1]] }
        ]
    },
    {
        name: 'twitch',
        facets: [
            { fill: '#9146ff', points: [[-0.46, -0.42], [0.5, -0.42], [0.5, 0.18], [0.14, 0.18], [-0.1, 0.44], [-0.1, 0.18], [-0.46, 0.18]] },
            { fill: '#6d32c9', points: [[-0.32, -0.28], [0.36, -0.28], [0.36, 0.08], [-0.32, 0.08]] },
            { fill: '#ffffff', points: [[-0.08, -0.18], [0.02, -0.18], [0.02, -0.02], [-0.08, -0.02]] },
            { fill: '#ffffff', points: [[0.16, -0.18], [0.26, -0.18], [0.26, -0.02], [0.16, -0.02]] }
        ]
    },
    {
        name: 'kick',
        facets: [
            { fill: '#53fc18', points: [[-0.46, -0.42], [-0.18, -0.42], [-0.18, 0.42], [-0.46, 0.42]] },
            { fill: '#39c90d', points: [[-0.14, -0.02], [0.22, -0.42], [0.52, -0.42], [0.16, 0.02]] },
            { fill: '#7cff4d', points: [[-0.12, 0.04], [0.2, 0.42], [0.52, 0.42], [0.14, -0.02]] },
            { fill: '#efffe8', points: [[-0.02, -0.08], [0.12, -0.02], [-0.02, 0.08], [-0.16, 0.02]] }
        ]
    }
];

function getRandomPlatformMark() {
    return PLATFORM_LOGO_MARKS[Math.floor(Math.random() * PLATFORM_LOGO_MARKS.length)];
}

function drawPolygon(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
}

// ========================================
// Spatial Partitioning System (Performance Optimization)
// ========================================

/**
 * Grid-based spatial partition for fast nearest-neighbor queries
 * Converts O(n) linear search to O(1) grid lookup
 */
class SpatialPartition {
    constructor(cellHeight = 150) {
        this.cells = new Map(); // Map<cellKey, cardData[]>
        this.cellHeight = cellHeight;
    }

    /**
     * Clear all cells
     */
    clear() {
        this.cells.clear();
    }

    /**
     * Add card to spatial grid
     * @param {Object} cardData - Card data with rect property
     */
    add(cardData) {
        const cellKey = Math.floor(cardData.rect.top / this.cellHeight);
        if (!this.cells.has(cellKey)) {
            this.cells.set(cellKey, []);
        }
        this.cells.get(cellKey).push(cardData);
    }

    /**
     * Get nearby cards at given Y position (O(1) operation)
     * @param {number} y - Y position to query
     * @returns {Array} Array of nearby card data objects
     */
    getNearby(y) {
        const cellKey = Math.floor(y / this.cellHeight);
        const nearby = [];

        // Check current cell and adjacent cells (±1)
        for (let offset = -1; offset <= 1; offset++) {
            const cell = this.cells.get(cellKey + offset);
            if (cell) nearby.push(...cell);
        }

        return nearby;
    }

    /**
     * Get statistics for debugging
     */
    getStats() {
        return {
            totalCells: this.cells.size,
            totalCards: Array.from(this.cells.values()).reduce((sum, arr) => sum + arr.length, 0)
        };
    }
}

// ========================================
// Global State
// ========================================
let snowEnabled = CONFIG.ENABLED;
let canvas = null;
let ctx = null;
let width, height;
let snowflakes = [];
let cardPositionsCache = [];
const spatialPartition = new SpatialPartition(150); // Spatial index for O(1) queries
let lastPositionUpdate = 0;
let animationId = null;
let domObserver = null;  // MutationObserver for DOM changes
let runtimeInitialized = false;
let runtimeListenersBound = false;
let cardsCache = [];
let cardsCacheDirty = true;
let pendingPositionUpdate = false;
let hoveredCard = null;
const accumulatedCountMap = new Map();
const cardDataMap = new Map();
const VIEWPORT_MARGIN = 120;

// Performance monitoring
let frameCount = 0;
let lastFpsCheck = Date.now();

const runtimeHandlers = {
    resize: () => resize(),
    scroll: () => schedulePositionUpdate(true),
    hoverIn: (event) => {
        const card = event.target.closest('.room-card');
        if (card) hoveredCard = card;
    },
    hoverOut: (event) => {
        const card = event.target.closest('.room-card');
        if (!card) return;
        const related = event.relatedTarget;
        if (related && card.contains(related)) return;
        if (hoveredCard === card) hoveredCard = null;
    },
    visibilityChange: () => {
        if (document.hidden) {
            stopAnimation();
        } else if (snowEnabled) {
            schedulePositionUpdate(true);
            startAnimation();
        }
    }
};

// ========================================
// Card Position Cache (Performance Optimization)
// ========================================

/**
 * Update all card positions with throttling
 */
function getCards() {
    if (!cardsCacheDirty && cardsCache.length) return cardsCache;
    cardsCache = Array.from(document.querySelectorAll('.room-card'));
    cardsCacheDirty = false;
    return cardsCache;
}

function schedulePositionUpdate(forceUpdate = false) {
    if (pendingPositionUpdate) return;
    pendingPositionUpdate = true;
    requestAnimationFrame(() => {
        pendingPositionUpdate = false;
        updateCardPositions(forceUpdate);
    });
}

function createSnowflakes() {
    snowflakes = [];
    CONFIG.COUNT = getPreferredSnowflakeCount();
    for (let i = 0; i < CONFIG.COUNT; i++) {
        snowflakes.push(new Snowflake());
    }
}

function removeSnowflakes(count) {
    if (count <= 0) return;

    const removed = snowflakes.splice(Math.max(0, snowflakes.length - count));
    removed.forEach((flake) => {
        if (flake.isAccumulated && flake.accumulatedOn) {
            decrementAccumulated(flake.accumulatedOn);
        }
    });
}

function syncSnowflakeCount(targetCount = getPreferredSnowflakeCount()) {
    const normalizedTarget = Math.max(0, Math.floor(targetCount));
    const currentCount = snowflakes.length;

    if (currentCount > normalizedTarget) {
        removeSnowflakes(currentCount - normalizedTarget);
    } else if (currentCount < normalizedTarget) {
        for (let i = currentCount; i < normalizedTarget; i++) {
            snowflakes.push(new Snowflake());
        }
    }

    CONFIG.COUNT = normalizedTarget;
}

function startDomObserver() {
    if (domObserver) return;

    domObserver = new MutationObserver(() => {
        cardsCacheDirty = true;
        schedulePositionUpdate(true);
    });

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        domObserver.observe(mainContent, {
            childList: true,
            subtree: true
        });
    }
}

function stopDomObserver() {
    if (!domObserver) return;
    domObserver.disconnect();
    domObserver = null;
}

function bindRuntimeListeners() {
    if (runtimeListenersBound) return;

    window.addEventListener('resize', runtimeHandlers.resize);
    window.addEventListener('scroll', runtimeHandlers.scroll, { passive: true });
    document.addEventListener('mouseover', runtimeHandlers.hoverIn, true);
    document.addEventListener('mouseout', runtimeHandlers.hoverOut, true);
    document.addEventListener('visibilitychange', runtimeHandlers.visibilityChange);

    runtimeListenersBound = true;
}

function unbindRuntimeListeners() {
    if (!runtimeListenersBound) return;

    window.removeEventListener('resize', runtimeHandlers.resize);
    window.removeEventListener('scroll', runtimeHandlers.scroll);
    document.removeEventListener('mouseover', runtimeHandlers.hoverIn, true);
    document.removeEventListener('mouseout', runtimeHandlers.hoverOut, true);
    document.removeEventListener('visibilitychange', runtimeHandlers.visibilityChange);

    runtimeListenersBound = false;
}

function startAnimation() {
    if (!snowEnabled || !ctx || animationId) return;
    loop();
}

function stopAnimation() {
    if (!animationId) return;
    cancelAnimationFrame(animationId);
    animationId = null;
}

function resetRuntimeState() {
    stopAnimation();
    snowflakes = [];
    cardPositionsCache = [];
    cardsCache = [];
    cardsCacheDirty = true;
    pendingPositionUpdate = false;
    hoveredCard = null;
    frameCount = 0;
    lastFpsCheck = Date.now();
    spatialPartition.clear();
    accumulatedCountMap.clear();
    cardDataMap.clear();

    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function ensureRuntime() {
    if (runtimeInitialized) {
        updateCardPositions(true);
        return;
    }

    resize();
    createSnowflakes();
    updateCardPositions(true);
    startDomObserver();
    bindRuntimeListeners();

    runtimeInitialized = true;
}

function teardownRuntime() {
    stopDomObserver();
    unbindRuntimeListeners();
    resetRuntimeState();
    runtimeInitialized = false;
}

function incrementAccumulated(card) {
    const next = (accumulatedCountMap.get(card) || 0) + 1;
    accumulatedCountMap.set(card, next);
    const cardData = cardDataMap.get(card);
    if (cardData) cardData.accumulatedCount = next;
}

function decrementAccumulated(card) {
    const current = accumulatedCountMap.get(card);
    if (!current) return;
    const next = current - 1;
    if (next <= 0) {
        accumulatedCountMap.delete(card);
    } else {
        accumulatedCountMap.set(card, next);
    }
    const cardData = cardDataMap.get(card);
    if (cardData) cardData.accumulatedCount = Math.max(0, next);
}

function updateCardPositions(forceUpdate = false) {
    const now = Date.now();
    if (!forceUpdate && now - lastPositionUpdate < CONFIG.POSITION_UPDATE_INTERVAL) {
        return;
    }
    lastPositionUpdate = now;

    const cards = getCards();
    cardPositionsCache = [];
    cardDataMap.clear();

    // Clear and rebuild spatial partition index
    spatialPartition.clear();

    cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const top = rect.top;
        const bottom = rect.bottom;
        // Only cache cards in or near the viewport
        if (bottom > -VIEWPORT_MARGIN && top < height + VIEWPORT_MARGIN) {
            const cardData = {
                element: card,
                rect: rect,
                top,
                left: rect.left,
                right: rect.right,
                isHovered: card === hoveredCard,
                accumulatedCount: accumulatedCountMap.get(card) || 0
            };
            cardPositionsCache.push(cardData);
            cardDataMap.set(card, cardData);
            // Add to spatial partition for O(1) lookups
            spatialPartition.add(cardData);
        }
    });

    accumulatedCountMap.forEach((_, card) => {
        if (!document.contains(card)) {
            accumulatedCountMap.delete(card);
        }
    });
}

// ========================================
// Snowflake Class (Enhanced with Physics)
// ========================================

class Snowflake {
    constructor() {
        this.reset(true);
    }

    /**
     * Reset snowflake to initial state
     */
    reset(initial = false) {
        if (this.isAccumulated && this.accumulatedOn) {
            decrementAccumulated(this.accumulatedOn);
        }
        this.x = Math.random() * width;
        this.y = initial ? Math.random() * height : -10 - Math.random() * 50;
        this.size = Math.random() * (CONFIG.MAX_SIZE - CONFIG.MIN_SIZE) + CONFIG.MIN_SIZE;
        this.baseSize = this.size;

        // 确保速度重置为基础速度
        const newSpeed = Math.random() * (CONFIG.MAX_SPEED - CONFIG.MIN_SPEED) + CONFIG.MIN_SPEED;
        this.speed = newSpeed;
        this.baseSpeed = newSpeed;

        this.opacity = Math.random() * 0.5 + 0.2;
        this.drift = Math.random() * 2 - 1;
        this.driftCycle = Math.random() * Math.PI * 2;
        this.mark = getRandomPlatformMark();

        // Accumulation properties
        this.isAccumulated = false;
        this.accumulatedOn = null;
        this.accumulatedOffsetX = 0;
        this.accumulatedOffsetY = 0;

        // Visual effects
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.035;
        this.wobble = Math.random() * Math.PI * 2;
    }

    /**
     * Update snowflake state
     */
    update() {
        if (this.isAccumulated) {
            this.updateAccumulated();
        } else {
            this.updateFalling();
        }
    }

    /**
     * Update accumulated snowflake (on card)
     */
    updateAccumulated() {
        // Check if card still exists
        if (!this.accumulatedOn || !document.contains(this.accumulatedOn)) {
            this.startFalling();
            return;
        }

        // Check if card is being hovered
        if (this.accumulatedOn === hoveredCard) {
            this.startFalling();
            return;
        }

        // Follow card position (handles scrolling)
        const rect = this.accumulatedOn.getBoundingClientRect();
        this.x = rect.left + this.accumulatedOffsetX;
        this.y = rect.top + this.accumulatedOffsetY;

        // Reset if moved too far out of viewport
        if (this.y > height + 100 || this.y < -100) {
            this.reset();
        }
    }

    /**
     * Update falling snowflake
     */
    updateFalling() {
        // Update position
        this.y += this.speed;
        this.driftCycle += 0.02;
        this.x += Math.sin(this.driftCycle) * 0.5 + this.drift * 0.1;

        // Update rotation
        this.rotation += this.rotationSpeed;

        // 🔥 Performance: O(1) spatial partition lookup (was O(n) filter)
        // Converts 9000 operations/sec (150 snowflakes × 60fps) to constant time
        const nearbyCards = spatialPartition.getNearby(this.y);

        // Collision detection with nearby cards only
        for (const cardData of nearbyCards) {
            // Skip hovered cards
            if (cardData.isHovered) continue;

            // Skip cards at accumulation limit
            if (cardData.accumulatedCount >= CONFIG.MAX_ACCUMULATED) continue;

            // Check collision
            if (this.checkCollision(cardData)) {
                this.accumulateOn(cardData.element, cardData.rect);
                return;
            }
        }

        // Reset if out of bounds
        if (this.y > height + 10 || this.x < -10 || this.x > width + 10) {
            this.reset();
        }
    }

    /**
     * Check collision with card top
     */
    checkCollision(cardData) {
        const collisionTop = cardData.top - CONFIG.COLLISION_OFFSET;
        const collisionBottom = cardData.top + 15;

        return (
            this.y + this.size >= collisionTop &&
            this.y <= collisionBottom &&
            this.x >= cardData.left &&
            this.x <= cardData.right
        );
    }

    /**
     * Accumulate on card
     */
    accumulateOn(card, rect) {
        incrementAccumulated(card);
        this.isAccumulated = true;
        this.accumulatedOn = card;

        // Save relative position (for scroll tracking)
        this.accumulatedOffsetX = this.x - rect.left;
        // Add random offset for natural snow pile effect
        this.accumulatedOffsetY = (Math.random() * 8 - 4);

        // Visual effect: make accumulated snow slightly larger
        this.size = this.baseSize * CONFIG.ACCUMULATED_SIZE_MULT;
        this.opacity = Math.min(this.opacity + 0.15, 0.85);
    }

    /**
     * Start falling from card (triggered by hover)
     */
    startFalling() {
        if (this.isAccumulated && this.accumulatedOn) {
            decrementAccumulated(this.accumulatedOn);
        }
        this.isAccumulated = false;
        this.accumulatedOn = null;

        // Restore original size
        this.size = this.baseSize;

        // Boost speed for falling effect
        this.speed = this.baseSpeed + CONFIG.FALL_SPEED_BOOST;

        // Add random drift
        this.drift = (Math.random() - 0.5) * 3;

        // Increase rotation speed
        this.rotationSpeed = (Math.random() - 0.5) * 0.3;
    }

    /**
     * Draw snowflake
     */
    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        const drawSize = this.isAccumulated
            ? this.size * 0.88
            : this.size;

        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.scale(drawSize, drawSize);

        for (const facet of this.mark.facets) {
            ctx.fillStyle = facet.fill;
            drawPolygon(facet.points);
        }

        if (this.isAccumulated) {
            // Accumulated snow: ellipse (flattened) - 移除光晕效果以提升性能
            ctx.globalAlpha *= 0.42;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(0, 0.28, 0.56, 0.16, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

// ========================================
// Initialization and Main Loop
// ========================================

/**
 * Resize canvas
 */
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    if (runtimeInitialized || snowflakes.length) {
        syncSnowflakeCount();
    }
    updateCardPositions(true);
}

/**
 * Performance monitoring
 */
function checkPerformance() {
    frameCount++;
    const now = Date.now();
    if (now - lastFpsCheck >= 1000) {
        const fps = frameCount;
        frameCount = 0;
        lastFpsCheck = now;

        // Reduce snowflakes if FPS too low
        const minimumCount = Math.min(30, getPreferredSnowflakeCount());
        if (fps < 30 && snowflakes.length > minimumCount) {
            const reducedCount = Math.max(
                minimumCount,
                snowflakes.length - Math.max(10, Math.ceil(snowflakes.length * 0.15))
            );
            console.log(`[Snow] FPS: ${fps}, reducing snowflakes to ${reducedCount}`);
            syncSnowflakeCount(reducedCount);
        }
    }
}

/**
 * Animation loop
 */
function loop() {
    if (!snowEnabled) {
        resetRuntimeState();
        return;
    }

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Update card positions (throttled)
    updateCardPositions();

    // Update and draw all snowflakes
    snowflakes.forEach(flake => {
        flake.update();
        flake.draw();
    });

    // Performance check
    checkPerformance();

    // 只在没有运行的情况下才请求下一帧
    animationId = requestAnimationFrame(loop);
}

/**
 * Initialize snow effect
 */
export function initSnow() {
    canvas = document.getElementById('snow-canvas');
    if (!canvas) {
        console.warn('[Snow] Canvas element not found');
        return;
    }

    ctx = canvas.getContext('2d');
    if (!ctx) {
        console.warn('[Snow] Failed to get canvas context');
        return;
    }

    updateSnowBtn();

    if (snowEnabled) {
        ensureRuntime();
        startAnimation();
    }

    console.log('[Snow] Initialization complete, enabled:', snowEnabled);
}

/**
 * Update snow button UI
 */
export function updateSnowBtn() {
    const btn = document.getElementById('snow-toggle-btn');
    if (!btn) return;

    if (snowEnabled) {
        btn.classList.remove('off');
        btn.classList.add('on');
        btn.dataset.state = 'on';
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('aria-label', '关闭下雪特效');
        btn.title = '关闭下雪特效';
        if (canvas) canvas.style.display = 'block';
    } else {
        btn.classList.remove('on');
        btn.classList.add('off');
        btn.dataset.state = 'off';
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', '开启下雪特效');
        btn.title = '开启下雪特效';
        if (canvas) canvas.style.display = 'none';
    }
}

/**
 * Toggle snow effect
 */
export function toggleSnow() {
    snowEnabled = !snowEnabled;
    updateSnowEnabled(snowEnabled);

    if (snowEnabled) {
        ensureRuntime();
        startAnimation();
        updateSnowBtn();
        showToast("❄️ 下雪特效已开启");
    } else {
        teardownRuntime();
        updateSnowBtn();
        showToast("下雪特效已关闭");
    }
}

/**
 * Destroy snow effect and clean up resources
 * Prevents memory leaks by removing event listeners and observers
 */
export function destroySnow() {
    snowEnabled = false;
    teardownRuntime();
    updateSnowBtn();

    console.log('[Snow] Effect destroyed and resources cleaned up');
}
