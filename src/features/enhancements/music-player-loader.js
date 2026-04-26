let loadPromise = null;
let initScheduled = false;

function defaultImporter() {
    return import('./music-player.js');
}

function getMusicPlayerShell() {
    if (typeof document === 'undefined') return null;
    return document.getElementById('music-player');
}

function setMusicPlayerShellReady(isReady) {
    const player = getMusicPlayerShell();
    if (!player) return;

    player.hidden = !isReady;
    if (isReady) {
        player.removeAttribute('aria-hidden');
        player.removeAttribute('inert');
    } else {
        player.setAttribute('aria-hidden', 'true');
        player.setAttribute('inert', '');
    }
}

function scheduleTask(callback) {
    // Keep the player lazy-loaded, but do not wait for an idle slot: the widget
    // is user-facing and should be ready as soon as the main app is interactive.
    setTimeout(callback, 0);
}

export function loadMusicPlayer(importer = defaultImporter) {
    if (loadPromise) return loadPromise;

    setMusicPlayerShellReady(false);
    loadPromise = importer()
        .then((module) => {
            module.initMusicPlayer();
            setMusicPlayerShellReady(true);
            return module;
        })
        .catch((error) => {
            loadPromise = null;
            console.error('[MusicPlayerLoader] Failed to initialize music player:', error);
            return null;
        });

    return loadPromise;
}

export function scheduleMusicPlayerInit(options = {}) {
    if (initScheduled || loadPromise) return;

    initScheduled = true;
    setMusicPlayerShellReady(false);
    const scheduler = options.scheduler || scheduleTask;

    scheduler(() => {
        initScheduled = false;
        void loadMusicPlayer(options.importer);
    });
}

export function resetMusicPlayerLoaderForTests() {
    loadPromise = null;
    initScheduled = false;
}
