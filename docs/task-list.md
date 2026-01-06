# Roaring Steel - Improvement Task List

Based on codebase analysis. All PRs target `vue-app` branch.

## Completed

### Task 1: Test Infrastructure
- **Branch**: `feat/test-setup`
- **PR**: #27 (merged)
- **Details**:
  - Installed @vue/test-utils and happy-dom
  - Created vitest.config.js with Pinia setup
  - Created tests/setup.js for test initialization
  - Added store tests (players, game, map) - 47 tests total
  - Fixed bug: game.js wasn't exposing `turn` state

### Task 2: Code Documentation
- **Branch**: `feat/code-documentation`
- **PR**: #28 (merged)
- **Details**:
  - Added JSDoc headers to all stores, composables, and components
  - Added function-level documentation with @param/@returns
  - Added inline comments for complex algorithms (naturalBreaks, focalOpElevation)
  - Documented component props/emits

### Task 3: Console.log Production Stripping
- **Status**: Complete
- **Details**: Configured Vite to automatically strip console.log in production builds

### Task 4: Error/Loading States in Stores
- **Branch**: `feat/store-error-loading-states`
- **Status**: Complete (pending PR)
- **Details**:
  - Added per-operation loading states to grid.js, industry.js, towns.js
  - Added try-catch error handling with console logging
  - Loading states exported for UI consumption:
    - `grid.js`: `isLoadingElevation`, `isLoadingLandCover`
    - `industry.js`: `isLoadingCSV`, `isLoadingQWI`
    - `towns.js`: `isLoadingIndustry`, `isLoadingPopulation`, `isLoadingCoordinates`

---

## Pending

### Task 5: Fix Vitest Config
- **Priority**: High
- **Effort**: Low
- **Description**: Fix vitest.config.js mergeConfig error
- **Issue**: `vite.config.js` uses callback form `defineConfig(({ mode }) => ...)` which can't be merged with `mergeConfig`
- **Files to modify**:
  - `vitest.config.js` - update merge strategy
  - Possibly `vite.config.js` - refactor to non-callback form
- **Blocking**: All tests currently fail to run

### Task 6: Add Tests for Async Stores
- **Priority**: Medium
- **Effort**: High
- **Description**: Add unit tests for grid.js, industry.js, and towns.js stores
- **Dependencies**: Task 5 (Fix Vitest Config)
- **Requirements**:
  - Mock external APIs (Elevation, LandCover, QWI, Census, TigerWeb)
  - Mock `@vueuse/core` useLocalStorage
  - Test loading state transitions
  - Test error handling paths
- **Files to create**:
  - `tests/stores/grid.spec.js`
  - `tests/stores/industry.spec.js`
  - `tests/stores/towns.spec.js`

### Task 7: Connect PlayerStore to UI
- **Priority**: High
- **Effort**: Medium
- **Description**: PlayerSelect component uses local state instead of the Pinia store
- **Files to modify**:
  - `src/components/setup/PlayerSelect.vue`
  - `src/stores/players.js`
- **Goal**: Use `usePlayerStore` for player management instead of local refs

### Task 8: Code Splitting
- **Priority**: Medium
- **Effort**: Low
- **Description**: Implement lazy loading for views to reduce initial bundle size
- **Current issue**: All views load immediately (555 kB JS bundle)
- **Implementation**:
  ```javascript
  const GameView = defineAsyncComponent(() => import('./views/GameView.vue'))
  ```

### Task 9: Grid Progress UI
- **Priority**: Medium
- **Effort**: Medium
- **Description**: Add modal overlay showing progress during grid setup
- **Details**: Grid cell fetching takes time; users need visual feedback
- **Implementation**:
  - Create progress modal component
  - Track loaded cells vs total cells
  - Show percentage and/or progress bar
  - Display during initial game setup

### Task 10: Request Batching for Grid API
- **Priority**: Medium
- **Effort**: Medium
- **Description**: Batch API requests for grid cells instead of sequential calls
- **Current issue**: Sequential API calls with random delays (200-2000ms each)
- **Files to modify**:
  - `src/stores/grid.js`
  - `src/composables/setup/useElevationAPI.js`
  - `src/composables/setup/useLandCoverAPI.js`

### Task 11: Centralized API Layer
- **Priority**: Low
- **Effort**: Medium
- **Description**: Create unified API service with consistent error handling
- **Benefits**:
  - Centralized error handling
  - Request/response interceptors
  - Consistent timeout handling
  - Retry logic for failed requests
- **Implementation**: Create `src/services/api.js` or similar

### Task 12: Split Complex Stores
- **Priority**: Low
- **Effort**: Medium
- **Description**: Break up large stores into smaller, focused modules
- **Candidates**:
  - `towns.js` (270 lines) - split naturalBreaks algorithm into utility
  - `grid.js` - separate focal operation logic

### Task 13: Vue Router
- **Priority**: Low
- **Effort**: Low
- **Description**: Replace string-based view switching with vue-router
- **Current**: `App.vue` uses `currentView` ref for navigation
- **Benefits**:
  - Browser history support
  - Deep linking
  - Route guards for game state
- **Note**: May not be necessary for single-page game app

---

## Future Considerations (Not Yet Planned)

- **Tailwind Migration**: Replace Bulma with Tailwind CSS (user mentioned future plan)
- **Leaflet Marker Clustering**: Add clustering for 100+ town markers
- **LocalStorage Cache Invalidation**: Current caching has no expiration strategy
- **TypeScript Migration**: Convert to TypeScript for better type safety
