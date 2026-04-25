/**
 * Lightweight coded ambient background.
 * Uses CSS variables only; no canvas, video, or WebGL.
 */

const POINTER_MEDIA = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION_MEDIA = '(prefers-reduced-motion: reduce)';
const IDLE_DELAY_MS = 900;
const LERP_SPEED = 0.075;

let cleanupAmbientBackground = null;

export function initAmbientBackground() {
    if (cleanupAmbientBackground) return cleanupAmbientBackground;

    const pointerQuery = window.matchMedia(POINTER_MEDIA);
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_MEDIA);

    if (!pointerQuery.matches || reducedMotionQuery.matches) {
        document.documentElement.classList.remove('ambient-bg-enabled');
        return () => {};
    }

    const root = document.documentElement;
    let targetX = window.innerWidth * 0.5;
    let targetY = window.innerHeight * 0.18;
    let currentX = targetX;
    let currentY = targetY;
    let targetStrength = 0.16;
    let currentStrength = targetStrength;
    let rafId = 0;
    let idleTimer = 0;

    const writeVars = () => {
        root.style.setProperty('--ambient-x', `${currentX.toFixed(1)}px`);
        root.style.setProperty('--ambient-y', `${currentY.toFixed(1)}px`);
        root.style.setProperty('--ambient-strength', currentStrength.toFixed(3));
    };

    const tick = () => {
        currentX += (targetX - currentX) * LERP_SPEED;
        currentY += (targetY - currentY) * LERP_SPEED;
        currentStrength += (targetStrength - currentStrength) * 0.06;
        writeVars();

        const settled =
            Math.abs(targetX - currentX) < 0.25 &&
            Math.abs(targetY - currentY) < 0.25 &&
            Math.abs(targetStrength - currentStrength) < 0.004;

        rafId = settled ? 0 : window.requestAnimationFrame(tick);
    };

    const scheduleTick = () => {
        if (!rafId) {
            rafId = window.requestAnimationFrame(tick);
        }
    };

    const handlePointerMove = (event) => {
        targetX = event.clientX;
        targetY = event.clientY;
        targetStrength = 0.42;
        root.classList.add('ambient-pointer-active');
        scheduleTick();

        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
            targetStrength = 0.18;
            root.classList.remove('ambient-pointer-active');
            scheduleTick();
        }, IDLE_DELAY_MS);
    };

    const handleResize = () => {
        targetX = Math.min(targetX, window.innerWidth);
        targetY = Math.min(targetY, window.innerHeight);
        scheduleTick();
    };

    root.classList.add('ambient-bg-enabled');
    writeVars();
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('resize', handleResize);

    cleanupAmbientBackground = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('resize', handleResize);
        window.clearTimeout(idleTimer);
        if (rafId) window.cancelAnimationFrame(rafId);
        root.classList.remove('ambient-bg-enabled', 'ambient-pointer-active');
        root.style.removeProperty('--ambient-x');
        root.style.removeProperty('--ambient-y');
        root.style.removeProperty('--ambient-strength');
        cleanupAmbientBackground = null;
    };

    return cleanupAmbientBackground;
}
