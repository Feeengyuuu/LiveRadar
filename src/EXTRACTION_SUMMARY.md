# Module Extraction Summary

This document describes the 7 JavaScript modules extracted from `LiveRadar_v3.1.1.html`.

## Extraction Date
December 26, 2025

## Source File
`G:\OwnProjects\LiveRader\LR_online\LiveRadar_v3.1.1.html`

---

## 📁 API Layer (`src/api/`)

### 1. **proxy-manager.js** (Lines ~2639-2888)
**Location:** `src/api/proxy-manager.js`

**Purpose:** Smart proxy selection with multi-tier failover system

**Key Features:**
- Multi-tier proxy failover strategy (premium/standard/fallback)
- Response time tracking and performance-based selection
- Geographic routing optimization for mainland/overseas users
- Success rate calculation with time decay (prevents stale data)
- Automatic proxy health monitoring
- Direct connection fallback for http/https protocols

**Exports:**
```javascript
export {
  getSmartProxyOrder,
  recordProxyResult,
  fetchWithProxy,
  fetchQuick,
  fetchTextWithProxy,
  ProxyManager
}
```

**Dependencies:**
- `APP_CONFIG` from `../config/constants.js`
- `PROXIES` from `../config/proxies.js`
- `Signer` from `../config/signer.js`
- `SafeStorage` from `../utils/safe-storage.js`

**State Management:**
- `proxyStats` - Proxy performance statistics loaded from localStorage

---

### 2. **platform-sniffers.js** (Lines ~2890-3121)
**Location:** `src/api/platform-sniffers.js`

**Purpose:** Platform-specific API integration for streaming platforms

**Key Features:**
- **Douyu (斗鱼):** ratestream API with betard fallback
- **Bilibili (哔哩哔哩):** Parallel requests for room info + user data, Master API for avatars
- **Twitch:** DecAPI integration with uptime parsing for live duration
- Live duration tracking across all platforms
- Async avatar fetching for performance
- Error handling with graceful degradation

**Exports:**
```javascript
export {
  getDouyuStatus,      // alias: sniffDouyu
  getBilibiliStatus,   // alias: sniffBilibili
  getTwitchStatus,     // alias: sniffTwitch
  initSniffers,
  updateImgTimestamp
}
```

**Dependencies:**
- `APP_CONFIG` from `../config/constants.js`
- `fetchWithProxy`, `fetchQuick` from `./proxy-manager.js`

**Dependency Injection:**
- `imgTimestamp` - Current image cache timestamp
- `roomDataCache` - Room data cache for avatar updates
- `debouncedSaveCache` - Debounced cache save function

---

## 🎯 Core Business Logic (`src/core/`)

### 3. **status-fetcher.js** (Lines ~3125-3211)
**Location:** `src/core/status-fetcher.js`

**Purpose:** Main dispatcher for fetching room status across platforms

**Key Features:**
- Platform-specific API routing (Douyu/Bilibili/Twitch)
- Avatar update throttling (respects `AVATAR_UPDATE_INTERVAL`)
- Data caching and incremental updates
- Heat value persistence (prevents loss on temporary failures)
- Change detection using `DataDiffer`
- Notification triggering for live status changes
- Douyu avatar fallback fetching

**Exports:**
```javascript
export {
  fetchRoomStatus,        // Main function
  initStatusFetcher       // Dependency injection
}
export default fetchRoomStatus;
```

**Dependencies:**
- `APP_CONFIG` from `../config/constants.js`
- `sniffDouyu`, `sniffBilibili`, `sniffTwitch` from `../api/platform-sniffers.js`
- `fetchQuick` from `../api/proxy-manager.js`
- `DataDiffer` from `../utils/data-differ.js`

**Dependency Injection:**
- `roomDataCache` - Global room data cache
- `debouncedSaveCache` - Debounced save function
- `checkAndNotify` - Notification trigger function
- `formatHeat` - Heat value formatter

---

### 4. **refresh-manager.js** (Lines ~3228-3378)
**Location:** `src/core/refresh-manager.js`

**Purpose:** Auto-refresh logic with concurrent request pool management

**Key Features:**
- Smart concurrent request pooling (configurable concurrency limits)
- Dynamic concurrency based on room count and device performance
- Auto-refresh with countdown timer
- Batch rendering for performance optimization (3 or 5 rooms per batch)
- Progress tracking and statistics display
- Debounce protection against duplicate refreshes (5s cooldown)
- Favorite-first sorting
- Initial jitter for load distribution
- Minimum loader display time enforcement (1.5s)

**Exports:**
```javascript
export {
  refreshAll,            // Main refresh function
  promisePool,           // Concurrent pool utility
  initRefreshManager,    // Dependency injection
  updateRefreshState,    // State updater
  getRefreshState        // State getter
}
export default refreshAll;
```

**Dependencies:**
- `APP_CONFIG` from `../config/constants.js`
- `ResourceManager` from `../utils/resource-manager.js`
- `fetchRoomStatus` from `./status-fetcher.js`

**Dependency Injection:**
- `rooms` - Room list array
- `roomDataCache` - Room data cache
- `updateRefreshStats` - Progress display updater
- `updateAutoRefreshBtn` - Auto-refresh button updater
- `detectStatusChanges` - Status change detector
- `loaderStartTime` - Loader start timestamp

**State Management:**
- `isRefreshing` - Current refresh status
- `lastRefreshTime` - Last refresh timestamp
- `imgTimestamp` - Image cache timestamp
- `refreshStats` - Progress statistics
- `autoRefreshEnabled` - Auto-refresh enabled flag
- `autoRefreshCountdown` - Countdown value

---

### 5. **renderer.js** (Lines ~3510-3791)
**Location:** `src/core/renderer.js`

**Purpose:** Incremental rendering system for room cards

**Key Features:**
- Incremental rendering (only updates changed data when `INCREMENTAL.ENABLED`)
- Smart DOM diffing to minimize reflows
- Card state management (live/offline/loop/loading)
- Performance-optimized DOM reference caching (`card._domRefs`)
- Live duration display with auto-formatting
- Lazy image loading with skeleton states
- Zone activation management (live/offline/loop sections)
- Favorite star animation
- Platform-specific branding colors

**Exports:**
```javascript
export {
  renderAll,      // Main render function
  createCard,     // Card creation
  updateCard,     // Card update
  initRenderer    // Dependency injection
}
export default renderAll;
```

**Dependencies:**
- `APP_CONFIG` from `../config/constants.js`

**Dependency Injection:**
- `rooms` - Room list array
- `roomDataCache` - Room data cache

**Performance Optimizations:**
- DOM reference caching avoids repeated `querySelector` calls
- Incremental updates skip unchanged cards (can reduce 80%+ of DOM operations)
- Lazy image loading with onload/onerror handlers
- Batch DOM updates using `appendChild` for automatic reordering

---

### 6. **file-protocol-warning.js** (Lines ~3800-3889)
**Location:** `src/core/file-protocol-warning.js`

**Purpose:** CORS warning detection and deployment guidance

**Key Features:**
- Detect `file://` protocol usage
- Display warning banner for CORS limitations
- Persistent dismiss state (localStorage)
- Deployment guide with multiple server options (Python/Node.js/VS Code)
- Fallback to memory storage when localStorage unavailable
- Global function exposure for HTML onclick handlers

**Exports:**
```javascript
export {
  checkFileProtocol,
  dismissFileWarning,
  dismissFileWarningPermanently,
  showDeploymentGuide,
  initFileProtocolWarning
}
export default { ... } // Object with all functions
```

**Dependencies:**
- `SafeStorage` from `../utils/safe-storage.js`

**Window API Exposure:**
The module exposes these functions to `window` for HTML onclick handlers:
- `window.dismissFileWarning()`
- `window.dismissFileWarningPermanently()`
- `window.showDeploymentGuide()`

---

### 7. **init.js** (Lines ~3917-4022)
**Location:** `src/core/init.js`

**Purpose:** Application initialization sequence and bootstrap

**Key Features:**
- File protocol warning check
- Region detection (Mainland China vs Overseas) with IP geolocation
- UI state initialization (placeholders, buttons, toggles)
- Bilibili cache cleanup for missing avatars (data migration)
- Audio system setup with iOS unlock support
- Network status monitoring (online/offline events)
- Auto-refresh initialization
- Back-to-top button with scroll throttling
- Secret audio test button setup
- Initial live status snapshot (prevents false notifications)
- Smart loader display (min 1.5s, cached data fast-path)

**Exports:**
```javascript
export {
  init,                      // Main init function
  initAppDependencies,       // Dependency injection
  detectUserRegion,
  updatePlaceholder,
  updateNotifyBtn,
  updateSnowBtn,
  updateRegionButtonState,
  unlockAllAudio,
  playNotificationSound,
  initAudio,
  initAutoRefresh,
  initNetworkMonitor,
  initBackToTopButton
}
export default init;
```

**Dependencies:**
- `APP_CONFIG` from `../config/constants.js`
- `SafeStorage` from `../utils/safe-storage.js`
- `ResourceManager` from `../utils/resource-manager.js`
- `checkFileProtocol` from `./file-protocol-warning.js`

**Dependency Injection:**
- `rooms` - Room list array
- `roomDataCache` - Room data cache
- `previousLiveStatus` - Status snapshot for change detection
- `notificationsEnabled` - Notification toggle state
- `notifyAudio` - Audio element reference
- `loaderStartTime` - Loader start timestamp

**Initialization Sequence:**
1. File protocol check
2. Region detection (async, non-blocking)
3. UI state updates
4. Secret audio button setup
5. Bilibili cache cleanup
6. Render cached data (if available)
7. Initial refresh (silent if no cache)
8. Auto-refresh init
9. Region button update
10. Audio system init
11. Network monitor init
12. Back-to-top button init

---

## 🔗 Module Dependency Graph

```
init.js
├── file-protocol-warning.js
│   └── SafeStorage
├── refresh-manager.js
│   ├── status-fetcher.js
│   │   ├── platform-sniffers.js
│   │   │   └── proxy-manager.js
│   │   │       ├── PROXIES (config)
│   │   │       ├── Signer (config)
│   │   │       └── SafeStorage
│   │   └── DataDiffer
│   └── ResourceManager
└── renderer.js
    └── APP_CONFIG
```

---

## 📝 Import Examples

### Using Proxy Manager
```javascript
import { fetchWithProxy, ProxyManager } from './api/proxy-manager.js';

// Fetch data with automatic proxy failover
const data = await fetchWithProxy('https://api.example.com/data');

// Get proxy statistics
const stats = ProxyManager.getStats();
```

### Using Platform Sniffers
```javascript
import { sniffDouyu, sniffBilibili, sniffTwitch } from './api/platform-sniffers.js';

// Initialize with dependencies
import { initSniffers } from './api/platform-sniffers.js';
initSniffers({ imgTimestamp, roomDataCache, debouncedSaveCache });

// Fetch platform status
const douyuData = await sniffDouyu('6979222', true, null);
const biliData = await sniffBilibili('545318', true, null);
```

### Using Refresh Manager
```javascript
import { refreshAll, initRefreshManager } from './core/refresh-manager.js';

// Initialize with dependencies
initRefreshManager({
  rooms,
  roomDataCache,
  updateRefreshStats,
  updateAutoRefreshBtn,
  detectStatusChanges,
  loaderStartTime
});

// Trigger refresh
await refreshAll(false, true); // silent=false, isAutoRefresh=true
```

### Using Renderer
```javascript
import { renderAll, initRenderer } from './core/renderer.js';

// Initialize with dependencies
initRenderer({ rooms, roomDataCache });

// Render all cards
renderAll();
```

---

## 🛠️ Configuration Requirements

All modules require these configuration files:

1. **`src/config/constants.js`** - APP_CONFIG object
2. **`src/config/proxies.js`** - PROXIES array
3. **`src/config/signer.js`** - Signer object with getDid()
4. **`src/utils/safe-storage.js`** - SafeStorage wrapper
5. **`src/utils/data-differ.js`** - DataDiffer utility
6. **`src/utils/resource-manager.js`** - ResourceManager utility

---

## 🔄 Circular Dependency Prevention

The modules use **dependency injection** pattern to avoid circular dependencies:

```javascript
// Instead of direct import:
// import { roomDataCache } from './state.js'; // ❌ Circular

// Use dependency injection:
let roomDataCache = {};
export function initModule(deps) {
  if (deps.roomDataCache) roomDataCache = deps.roomDataCache;
}
```

This allows parent modules to inject dependencies at runtime.

---

## 🎯 Key Design Patterns

1. **Dependency Injection:** All modules accept external dependencies via `init*()` functions
2. **Named + Default Exports:** Modules export both named functions and a default export
3. **State Encapsulation:** State variables are module-private, accessed via getters/setters
4. **Pure Functions:** Most functions are pure (given same inputs, return same outputs)
5. **Error Handling:** All async functions use try-catch and return null on failure
6. **Performance Optimization:**
   - DOM reference caching
   - Incremental rendering
   - Batch operations
   - Request pooling
   - Debounced saves

---

## 🚀 Next Steps

To integrate these modules into the main application:

1. **Create a main entry point** (`src/main.js`) that:
   - Imports all modules
   - Sets up dependency injection
   - Calls `init()` on DOM ready

2. **Update HTML** to use ES6 modules:
   ```html
   <script type="module" src="src/main.js"></script>
   ```

3. **Test incrementally:**
   - Test proxy manager independently
   - Test platform sniffers with mock data
   - Test renderer with static data
   - Test full integration

4. **Consider bundling** for production:
   - Use Vite, Rollup, or esbuild
   - Generate source maps for debugging
   - Minify for production

---

## 📊 Module Statistics

| Module | Lines | Size | Exports | Dependencies |
|--------|-------|------|---------|--------------|
| proxy-manager.js | ~250 | 13KB | 6 | 4 |
| platform-sniffers.js | ~232 | 13KB | 9 | 2 |
| status-fetcher.js | ~87 | 6KB | 3 | 5 |
| refresh-manager.js | ~151 | 10KB | 6 | 3 |
| renderer.js | ~282 | 15KB | 4 | 1 |
| file-protocol-warning.js | ~90 | 5KB | 6 | 1 |
| init.js | ~106 | 17KB | 13 | 4 |
| **Total** | **~1198** | **79KB** | **47** | **20** |

---

## ✅ Extraction Checklist

- [x] All 7 modules created
- [x] ES6 imports added for all dependencies
- [x] ES6 exports added for all functions/objects
- [x] Module-level comments added
- [x] Function JSDoc comments preserved
- [x] Error handling preserved
- [x] Dependency injection implemented
- [x] CryptoJS kept as window.CryptoJS (CDN)
- [x] Important comments preserved
- [x] Code formatting maintained

---

## 📖 Additional Notes

### CryptoJS Handling
CryptoJS remains as `window.CryptoJS` (loaded from CDN in HTML). The `Signer` module (in `src/config/signer.js`) handles all CryptoJS interactions.

### Window API Exposure
Some functions are exposed to `window` object for HTML onclick handlers:
- File warning dismissal functions
- Deployment guide function
- Audio unlock/test functions (for compatibility)

### Performance Considerations
- **Incremental rendering** can reduce DOM operations by 80%+ on typical refreshes
- **Concurrent pooling** with dynamic limits (4-8 concurrent requests) prevents browser throttling
- **DOM reference caching** eliminates repeated querySelector calls
- **Debounced saves** reduce localStorage writes from 100+/refresh to 1/refresh

### Browser Compatibility
All modules use:
- ES6+ syntax (arrow functions, async/await, destructuring)
- Modern fetch API
- Promise.allSettled (ES2020)
- Optional chaining (?.) where appropriate

**Target:** Modern browsers (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)

---

**End of Extraction Summary**
