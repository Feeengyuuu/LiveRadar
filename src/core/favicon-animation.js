let animationTimer = null;
let initialized = false;

function makeFrameUrl(color, coreRadius, coreOpacity, glowRadius, glowOpacity) {
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'>` +
        `<circle cx='8' cy='8' r='${glowRadius}' fill='${color}' fill-opacity='${glowOpacity}'/>` +
        `<circle cx='8' cy='8' r='${coreRadius}' fill='${color}' fill-opacity='${coreOpacity}'/>` +
        `</svg>`;

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function initFaviconAnimation() {
    if (initialized) return;

    const favicon = document.getElementById('favicon');
    if (!favicon) return;

    const color = '#ef4444';
    const frames = [
        makeFrameUrl(color, 2.2, 0.5, 4.8, 0.08),
        makeFrameUrl(color, 2.6, 0.7, 5.4, 0.16),
        makeFrameUrl(color, 3.0, 0.9, 6.0, 0.28),
        makeFrameUrl(color, 3.4, 1.0, 6.8, 0.38),
    ];

    let index = 0;
    let direction = 1;

    const tick = () => {
        favicon.href = frames[index];
        if (index === frames.length - 1) direction = -1;
        if (index === 0) direction = 1;
        index += direction;
    };

    const startAnimation = () => {
        if (animationTimer) return;
        tick();
        animationTimer = setInterval(tick, 260);
    };

    const stopAnimation = () => {
        if (!animationTimer) return;
        clearInterval(animationTimer);
        animationTimer = null;
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAnimation();
        } else {
            startAnimation();
        }
    });

    if (!document.hidden) {
        startAnimation();
    }

    initialized = true;
}
