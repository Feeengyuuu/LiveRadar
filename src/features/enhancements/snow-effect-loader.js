import { isSnowEnabled } from '../../core/state.js';
import { showToast } from '../../utils/helpers.js';

let loadPromise = null;
let loadedModule = null;
let moduleInitialized = false;

function defaultImporter() {
    return import('./snow-effect.js');
}

function getSnowButton() {
    if (typeof document === 'undefined') return null;
    return document.getElementById('snow-toggle-btn');
}

function getSnowCanvas() {
    if (typeof document === 'undefined') return null;
    return document.getElementById('snow-canvas');
}

function syncSnowShell(enabled = isSnowEnabled()) {
    const btn = getSnowButton();
    if (btn) {
        btn.classList.toggle('on', enabled);
        btn.classList.toggle('off', !enabled);
    }

    const canvas = getSnowCanvas();
    if (canvas) {
        canvas.style.display = enabled ? 'block' : 'none';
    }
}

function loadSnowEffect(importer = defaultImporter) {
    if (loadedModule) return Promise.resolve(loadedModule);
    if (loadPromise) return loadPromise;

    loadPromise = importer()
        .then((module) => {
            loadedModule = module;
            return module;
        })
        .catch((error) => {
            loadPromise = null;
            console.error('[SnowLoader] Failed to load snow effect:', error);
            throw error;
        });

    return loadPromise;
}

function initializeSnowModule(module) {
    if (!moduleInitialized) {
        module.initSnow();
        moduleInitialized = true;
    }
}

export async function initSnow(options = {}) {
    syncSnowShell();

    if (!isSnowEnabled()) {
        return null;
    }

    try {
        const module = await loadSnowEffect(options.importer);
        initializeSnowModule(module);
        return module;
    } catch (error) {
        showToast('下雪特效加载失败', 'error');
        return null;
    }
}

export async function toggleSnow(options = {}) {
    try {
        const module = await loadSnowEffect(options.importer);
        initializeSnowModule(module);
        module.toggleSnow();
        return module;
    } catch (error) {
        showToast('下雪特效加载失败', 'error');
        return null;
    }
}

export function updateSnowBtn() {
    if (loadedModule) {
        loadedModule.updateSnowBtn();
        return;
    }

    syncSnowShell();
}

export function resetSnowEffectLoaderForTests() {
    loadPromise = null;
    loadedModule = null;
    moduleInitialized = false;
}
