let loadPromise = null;
let initScheduled = false;

function defaultImporter() {
    return import('./music-player.js');
}

function scheduleTask(callback) {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => callback(), { timeout: 1500 });
        return;
    }

    setTimeout(callback, 0);
}

export function loadMusicPlayer(importer = defaultImporter) {
    if (loadPromise) return loadPromise;

    loadPromise = importer()
        .then((module) => {
            module.initMusicPlayer();
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
