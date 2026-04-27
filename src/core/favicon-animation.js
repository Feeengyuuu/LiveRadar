let animationTimer = null;
let initialized = false;

const FRAME_INTERVAL_MS = 1400;
const IDLE_STOP_DELAY_MS = 30000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

function makeFrameUrl(color, coreRadius, coreOpacity, glowRadius, glowOpacity) {
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>` +
        `<rect x='3.5' y='3.5' width='25' height='25' rx='7' fill='#050608'/>` +
        `<path d='M8.4 17.2a9.3 9.3 0 0 1 15.6-6.8' fill='none' stroke='#cfd3d7' stroke-width='1.1' stroke-linecap='round' opacity='.9'/>` +
        `<path d='M23.6 16.2a8.8 8.8 0 0 1-13.9 7.1' fill='none' stroke='#cfd3d7' stroke-width='1.1' stroke-linecap='round' opacity='.72'/>` +
        `<defs><clipPath id='moonClip'><circle cx='16' cy='16.3' r='4.65'/></clipPath></defs>` +
        `<circle cx='16' cy='16.3' r='4.65' fill='#a9adb1'/>` +
        `<g clip-path='url(#moonClip)'>` +
        `<path d='M11.6 15.1 14.4 11.7 16.6 13.2 15.2 16.5Z' fill='#f1f2ee' fill-opacity='.36'/>` +
        `<path d='M16.4 12 20.9 15.7 17.7 16.7 14.9 15Z' fill='#d7d9d8' fill-opacity='.28'/>` +
        `<path d='M16.6 16.9 20.7 17.2 18.5 21.1 15.3 18.9Z' fill='#3b3e42' fill-opacity='.34'/>` +
        `<polygon points='14,13.5 14.7,13.1 15.3,13.5 15.1,14.3 14.3,14.4 13.8,13.9' fill='#5e6266'/>` +
        `<polygon points='17.6,14.2 18.2,14 18.7,14.4 18.5,15 17.9,15.1 17.5,14.7' fill='#575b60'/>` +
        `<polygon points='13.2,17 13.8,16.5 14.6,16.8 14.8,17.6 14.1,18.1 13.4,17.8' fill='#55595d'/>` +
        `<polygon points='16,17.1 17,16.7 17.8,17.3 17.7,18.3 16.7,18.7 15.8,18.1' fill='#4b4f54'/>` +
        `</g>` +
        `<circle cx='16' cy='16.3' r='4.65' fill='none' stroke='#f4f5f1' stroke-opacity='.35' stroke-width='.45'/>` +
        `<circle cx='9.2' cy='8.7' r='${glowRadius}' fill='${color}' fill-opacity='${glowOpacity}'/>` +
        `<circle cx='9.2' cy='8.7' r='${coreRadius}' fill='${color}' fill-opacity='${coreOpacity}'/>` +
        `</svg>`;

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function initFaviconAnimation() {
    if (initialized) return;

    const favicon = document.getElementById('favicon');
    if (!favicon) return;

    const color = '#ff2738';
    const frames = [
        makeFrameUrl(color, 2.0, 0.52, 4.0, 0.08),
        makeFrameUrl(color, 2.25, 0.72, 4.6, 0.15),
        makeFrameUrl(color, 2.5, 0.92, 5.2, 0.24),
        makeFrameUrl(color, 2.8, 1.0, 5.8, 0.32),
    ];

    let index = 0;
    let direction = 1;
    let idleTimer = null;

    const tick = () => {
        favicon.href = frames[index];
        if (index === frames.length - 1) direction = -1;
        if (index === 0) direction = 1;
        index += direction;
    };

    const startAnimation = () => {
        if (animationTimer) return;
        tick();
        animationTimer = setInterval(tick, FRAME_INTERVAL_MS);
    };

    const stopAnimation = () => {
        if (!animationTimer) return;
        clearInterval(animationTimer);
        animationTimer = null;
    };

    const clearIdleTimer = () => {
        if (!idleTimer) return;
        clearTimeout(idleTimer);
        idleTimer = null;
    };

    const markActive = () => {
        if (document.hidden) return;
        startAnimation();
        clearIdleTimer();
        idleTimer = setTimeout(() => {
            idleTimer = null;
            stopAnimation();
        }, IDLE_STOP_DELAY_MS);
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
        window.addEventListener(eventName, markActive, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearIdleTimer();
            stopAnimation();
        } else {
            markActive();
        }
    });

    if (!document.hidden) {
        markActive();
    }

    initialized = true;
}
