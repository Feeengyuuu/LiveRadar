/**
 * ====================================================================
 * Renderer - Main Facade Module
 * ====================================================================
 *
 * Lightweight facade that re-exports renderer sub-modules.
 * Maintains backward compatibility while keeping code organized.
 *
 * Module breakdown:
 * - image-handler.js: Image loading & event management (~200 lines)
 * - card-factory.js: Card creation from template (~70 lines)
 * - card-renderer.js: Card update & state management (~250 lines)
 * - grid-manager.js: Main rendering engine & grid orchestration (~320 lines)
 *
 * Benefits of module split:
 * - Improved code organization and maintainability
 * - Faster file loading (smaller chunks)
 * - Better code reuse potential
 * - Clearer responsibility boundaries
 *
 * @module core/renderer
 */

// Re-export all public APIs from sub-modules
export { initRenderer, renderAll, debouncedRenderAll } from './renderer/grid-manager.js';
export { createCard } from './renderer/card-factory.js';
export { updateCard } from './renderer/card-renderer.js';
export { setImageSource, getSmartImageUrl, setImageHandlers } from './renderer/image-handler.js';
