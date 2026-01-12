/**
 * Snow Effect Module - Complete implementation based on original LiveRadar
 * Features: Physics-based accumulation, card collision, hover-triggered falling
 */

import { SafeStorage } from '../../utils/safe-storage.js';
import { ResourceManager } from '../../utils/resource-manager.js';

// ========================================
// Configuration (aligned with original file)
// ========================================
const CONFIG = {
    ENABLED: SafeStorage.getItem('pro_snow_enabled', 'false') === 'true',  // 默认关闭，所有设备都支持
    COUNT: window.innerWidth < 768 ? 80 : 500,  // 优化：移动端80个，桌面端500个
    MAX_SIZE: 3.5,                  // Maximum size (pixels)
    MIN_SIZE: 1,                    // Minimum size (pixels)
    MAX_SPEED: 1.2,                 // Maximum fall speed
    MIN_SPEED: 0.3,                 // Minimum fall speed
    MAX_ACCUMULATED: 12,            // Max accumulated snowflakes per card
    FALL_SPEED_BOOST: 1.5,          // Fall acceleration multiplier
    ACCUMULATED_SIZE_MULT: 1.3,     // Accumulated snowflake size multiplier
    COLLISION_OFFSET: 5,            // Collision detection offset (pixels)
    POSITION_UPDATE_INTERVAL: 100,  // Card position update interval (ms)
};

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

        // Accumulation properties
        this.isAccumulated = false;
        this.accumulatedOn = null;
        this.accumulatedOffsetX = 0;
        this.accumulatedOffsetY = 0;

        // Visual effects
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.1;
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
        if (this.accumulatedOn.matches(':hover')) {
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
        ctx.fillStyle = 'white';

        if (this.isAccumulated) {
            // Accumulated snow: ellipse (flattened) - 移除光晕效果以提升性能
            ctx.beginPath();
            ctx.ellipse(
                this.x, this.y,
                this.size * 1.2,  // Wider horizontally
                this.size * 0.8,  // Flatter vertically
                0, 0, Math.PI * 2
            );
            ctx.fill();
        } else {
            // Falling snow: simple circle (移除rotation以减少transform操作)
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
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
        if (fps < 30 && snowflakes.length > 50) {
            console.log(`[Snow] FPS: ${fps}, reducing snowflakes`);
            snowflakes.splice(0, 20);
        }
    }
}

/**
 * Animation loop
 */
function loop() {
    if (!snowEnabled) {
        ctx.clearRect(0, 0, width, height);
        // 确保动画停止
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
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
    // 移动端也支持下雪，只是减少雪花数量
    console.log('[Snow] Initializing (mobile-friendly)');

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

    // Setup canvas
    resize();
    ResourceManager.addEventListener(window, 'resize', resize);

    // Scroll handler: force update card positions
    const scrollHandler = () => schedulePositionUpdate(true);
    ResourceManager.addEventListener(window, 'scroll', scrollHandler, { passive: true });

    // Create snowflakes
    snowflakes = [];
    for (let i = 0; i < CONFIG.COUNT; i++) {
        snowflakes.push(new Snowflake());
    }

    // Initialize card positions
    updateCardPositions(true);

    // Watch for DOM changes (new/removed cards)
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

    const handleHoverIn = (event) => {
        const card = event.target.closest('.room-card');
        if (card) hoveredCard = card;
    };
    const handleHoverOut = (event) => {
        const card = event.target.closest('.room-card');
        if (!card) return;
        const related = event.relatedTarget;
        if (related && card.contains(related)) return;
        if (hoveredCard === card) hoveredCard = null;
    };

    ResourceManager.addEventListener(document, 'mouseover', handleHoverIn, true);
    ResourceManager.addEventListener(document, 'mouseout', handleHoverOut, true);
    ResourceManager.addEventListener(document, 'visibilitychange', () => {
        if (document.hidden) {
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
        } else if (snowEnabled && !animationId) {
            loop();
        }
    });

    // Start animation if enabled
    if (snowEnabled) {
        // 确保之前的动画已停止
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        loop();
    }

    // Update button state
    updateSnowBtn();

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
        if (canvas) canvas.style.display = 'block';
    } else {
        btn.classList.remove('on');
        btn.classList.add('off');
        if (canvas) canvas.style.display = 'none';
    }
}

/**
 * Toggle snow effect
 */
export function toggleSnow() {
    snowEnabled = !snowEnabled;
    SafeStorage.setItem('pro_snow_enabled', snowEnabled);
    updateSnowBtn();

    // 先停止现有的动画循环
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (snowEnabled) {
        // 重新创建 MutationObserver（如果不存在）
        if (!domObserver) {
            domObserver = new MutationObserver(() => {
                updateCardPositions(true);
            });
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                domObserver.observe(mainContent, {
                    childList: true,
                    subtree: true
                });
            }
        }

        if (canvas && ctx) {
            // 确保只启动一个循环
            if (!animationId) {
                loop();
            }
        }
        window.showToast?.("❄️ 下雪特效已开启");
    } else {
        // 关闭时清理 MutationObserver，防止内存泄漏
        if (domObserver) {
            domObserver.disconnect();
            domObserver = null;
        }

        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        window.showToast?.("下雪特效已关闭");
    }
}

/**
 * Destroy snow effect and clean up resources
 * Prevents memory leaks by removing event listeners and observers
 */
export function destroySnow() {
    // Disable snow
    snowEnabled = false;

    // Stop animation
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    // Clear snowflakes
    snowflakes = [];

    // Disconnect MutationObserver
    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }

    // Clear canvas
    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // ResourceManager will automatically clean up event listeners
    // when ResourceManager.cleanup() is called

    console.log('[Snow] Effect destroyed and resources cleaned up');
}

window.updateSnowBtn = updateSnowBtn;
