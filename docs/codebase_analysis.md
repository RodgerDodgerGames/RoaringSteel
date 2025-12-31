# Codebase Analysis Report

**Date:** December 31, 2025
**Project:** Roaring Steel - Empire Builder Game

---

## Executive Summary

This analysis covers optimization opportunities, structural improvements, package recommendations, and performance enhancements for the Roaring Steel Vue 3 codebase. The project has solid foundational architecture but needs refinement in error handling, performance optimization, and code organization.

---

## 1. Package/Dependency Analysis

### Current Dependencies (package.json)

| Package | Version | Status |
|---------|---------|--------|
| Vue | 3.5.26 | Latest stable |
| Pinia | 2.3.1 | Latest |
| Leaflet | 1.9.4 | Latest stable |
| Bulma | 1.0.4 | Latest stable |
| @turf/turf | 7.3.1 | GIS library |
| @vueuse/core | 14.1.0 | Composition utilities |
| PapaParse | 5.5.3 | CSV parsing |

### Issues & Recommendations

#### Unused Dependencies (Remove)
- `@geoman-io/leaflet-geoman-free@2.19.0` - Imported but never used in the codebase. Only referenced in `/src/composables/map/useTowns.js` but the drawing functionality is not implemented.
- `leaflet-textpath@1.3.0` - Imported but appears unused. Only referenced in `/src/composables/map/useBuildTrack.js` which seems incomplete.

#### Missing Dependencies (Add)
- **TypeScript** - No type safety currently; would improve development experience significantly
- **Error handling library** - No centralized error handling
- **Testing** - Vitest installed but `/tests` folder is empty
- **Logging library** - Currently using raw `console.log()` (89 instances found)

#### Bundle Size Concerns
- Production JS bundle: **555.68 kB** (170.45 kB gzipped)
- CSS bundle: **733.24 kB** (80.99 kB gzipped)
- Build warning: "chunks larger than 500 kB after minification"
- Full Bulma CSS heavily included - should use SCSS with selective imports

---

## 2. Project Structure Analysis

### Current Structure
```
src/
├── components/           (10 Vue files)
│   ├── demands/         (demand cards UI)
│   ├── map/            (map components)
│   ├── panel/          (side panel)
│   └── setup/          (player setup UI)
├── stores/             (7 Pinia stores)
├── composables/        (map & setup logic)
│   ├── map/           (2 files: useTowns, useBuildTrack)
│   └── setup/         (8 files: API integration)
├── config/            (5 config files)
├── views/             (3 view files)
└── assets/            (fonts, icons, images, styles)
```

### Strengths
- Well-organized by feature (setup, map, demands, panel)
- Clear separation between views, components, stores, and logic
- Composables properly split between map and setup concerns
- Configuration files appropriately isolated

### Issues

#### Incomplete Features
- `useBuildTrack.js` - Imported but incomplete/unused
- `useBLS.js`, `useCSV.js` - Created but unused
- `GameView.vue` - Minimal implementation (just layout)
- `DrawButtons.vue` - Component exists but unused in any view

#### Missing Core Files
- No actual game logic layer (only data loading)
- No route configuration (using string-based view switching)
- No proper error handling components
- No loading/spinner components

#### Store Organization Issues
- 7 stores with unclear separation of concerns
- `game.js` - Only stores region & turn (minimal)
- `players.js` - Well-structured but not used by views
- `towns.js` - Logic-heavy (270 lines) should be split
- `industry.js` - Highly coupled to API fetching
- Missing clear data flow between stores

#### API/Composable Concerns
- API calls mixed with data transformation in composables
- No centralized API client or request handling
- Hardcoded URLs in multiple files
- No caching strategy beyond localStorage

### Recommendations
- Create `router.js` for proper navigation
- Move API-related logic to dedicated API layer
- Create composables for common patterns
- Clean up unused files (useBuildTrack, useBLS, useCSV, DrawButtons)
- Split large stores (towns.js especially)
- Add error boundary component

---

## 3. Vue 3 Best Practices Analysis

### Positives
- Correct use of `<script setup>` syntax across all components
- Proper `defineEmits()` and `defineProps()` usage
- Good use of Composition API with composables
- Reactive refs properly used throughout
- Computed properties correctly implemented

### Issues & Anti-Patterns

#### Props/Emits Validation
```javascript
// Good example (PlayerConfirm.vue):
const props = defineProps({
  players: {
    type: Array,
    required: true
  }
})

// Missing type definitions in many components
// PlayerSelect.vue doesn't define props/emits properly
```

#### Reactive State Management
- **Console.logs everywhere** (89 instances) - Should use proper logging
- Direct store mutations mixed with actions
- Props drilling in some components (App.vue passing events down)

#### Missing Error Handling
- No try-catch in most API calls
- Promises without error handling (towns.js, grid.js)
- Silent failures in land cover API

#### Lifecycle Issues
- `onMounted` used correctly in MainMap.vue
- Missing cleanup in some composables
- `keepalive` used in WelcomeView but not necessary

### Recommendations
- Add proper prop/emit type definitions everywhere
- Implement centralized logging instead of console.log
- Add error boundaries/error handling components
- Create error states in stores
- Add loading states for async operations
- Validate all user inputs

---

## 4. State Management Analysis

### Store Architecture

#### Game Store (`game.js`)
```javascript
- region: null          // Only 2 state properties
- turn: 0
```
Very minimal, could expand with gameStatus, currentPlayer, gamePhase.

#### Players Store (`players.js`)
- Well-structured with addPlayer, updatePlayer, removePlayer, nextTurn
- **NOT connected to UI** - Components manage local state instead
- Duplicate logic in PlayerConfirm.vue

#### Towns Store (`towns.js` - 270 lines)
- Heavy logic burden - includes naturalBreaks algorithm
- Mixed concerns: data fetching + data transformation
- localStorage caching embedded
- Should split into data store and town assignment composable

#### Industry Store (`industry.js`)
- Tightly coupled to API fetching
- Complex data transformation mixed with state management

#### Demand Cards Store (`demandCards.js`)
- Self-contained, good separation
- Helper functions properly defined

#### Grid Store (`grid.js`)
- Well-structured for spatial data
- Good use of helper functions

#### Map Store (`map.js`)
- Simple state holder - good practice

### Major Issues

1. **Unused Store** - `usePlayerStore` defined but never populated from UI
2. **No Error States** - None of the stores have isLoading, error, errorMessage
3. **No Validation** - Stores don't validate incoming data
4. **Coupling Issues** - towns.js directly imports and uses industryStore

### Recommendations
- Integrate PlayerStore properly into UI flow
- Add error and loading states to all stores
- Split complex stores (towns.js, industry.js)
- Create derived computed properties instead of direct store access
- Add input validation in store actions
- Use getters more extensively

---

## 5. Code Quality Analysis

### Console.log Pollution
- 89 instances of `console.log()` throughout codebase
- Found in critical paths (API calls, data generation, game logic)
- Should be removed or replaced with proper logging

### Code Duplication

#### API Setup Pattern (repeated in useCensus.js, useQWI.js)
```javascript
// Repeated in 2+ places:
const key = import.meta.env.VITE_QWI_KEY
const rootUrl = '...'
const url = Object.keys(params).reduce((acc, key) => {...})

// Should extract to shared utility
```

#### Data Transformation Patterns
- naturalBreaks algorithm only in towns.js
- API response parsing logic duplicated across composables
- URL building repeated multiple times

### Complexity Issues

#### High Cognitive Complexity
- `assignIndustries()` in towns.js (80+ lines)
- Nested loops with multiple conditions
- Should be broken into smaller functions

#### Magic Numbers
```javascript
// grid.js:
await waitRandomly(200, 2000)  // Why these numbers?

// towns.js:
const maxTownsForIndustry = 0.2  // 20% - should be constant
const maxIndustries = 3

// Should move to config
```

### Recommendations
- Create proper logging system
- Extract common API patterns to shared utility
- Create validation utils for common checks
- Move magic numbers to config files
- Add comprehensive error handling
- Break complex functions into smaller units
- Add JSDoc comments to complex functions

---

## 6. Build Configuration Analysis

### vite.config.js
- Minimal configuration (only 18 lines)
- Path alias (@) properly configured
- Vue 3 plugin enabled
- **Missing**: No optimization configurations, no code splitting setup

### Issues

#### Bundle Size Warning
- Main JS chunk: 555.68 kB (exceeds 500 kB limit)
- CSS chunk: 733.24 kB
- No code splitting configured

#### Missing Vite Optimizations
```javascript
// Should add:
- rollupOptions for manualChunks
- terser config for minification
- assets size limits
```

#### Environment Variables
- `.env` contains API key (VITE_QWI_KEY)
- Should use .env.local for local development
- No validation that required env vars exist

### Recommendations
- Add code splitting in vite.config.js
- Configure rollup manualChunks (separate Leaflet, Bulma)
- Lazy load views
- Add build:preview script
- Create .env.example with required variables
- Add pre-commit hooks (husky)

---

## 7. CSS/Styling Analysis

### Current Architecture
- Bulma 1.0.4 as primary framework
- Custom SCSS files in /assets
- Scoped styles in components

### Issues

#### Bulma Usage
- Full Bulma imported (733 kB CSS)
- Should use SCSS variables/mixins only
- No custom theme configuration visible

#### Hardcoded Values
```javascript
// In WelcomeView.vue:
.roaring-title {
  font-size: 4rem;    // Hardcoded
}

// In MainMap.vue:
.map-container {
  height: 100vh;      // Assumes full viewport
}
```

#### Missing Responsive Design
- No mobile breakpoint considerations in map
- 100vh problematic on mobile
- Inconsistent use of Bulma responsive classes

#### Asset Loading Issues
```javascript
// In WelcomeView.vue:
background-image: url('src/assets/images/Unknown.jpg');
// Build warning: "referenced in src/assets didn't resolve at build time"

// Should use import instead:
import bgImage from '@/assets/images/Unknown.jpg'
```

### Recommendations
- Replace full Bulma with minimal custom CSS
- Create SCSS variables for colors, spacing
- Implement CSS variables for theming
- Fix image imports to use ES modules
- Consider font subsetting
- Add proper responsive breakpoints

---

## 8. Performance Analysis

### Build Performance
- Build time: 4.05 seconds (acceptable)
- Bundle size: 555.68 kB JS + 733 kB CSS (bloated)

### Runtime Performance Issues

#### No Code Splitting
All code in single 555 kB chunk. Views should be lazy-loaded:
```javascript
const GameView = defineAsyncComponent(() => import('./views/GameView.vue'))
const AreaSelectView = defineAsyncComponent(() => import('./views/AreaSelectView.vue'))
const WelcomeView = defineAsyncComponent(() => import('./views/WelcomeView.vue'))
```

#### Heavy API Calls Without Pagination
- Grid generation fetches elevation for every cell
- Land cover API called for each grid cell with waits
- No batching optimization for land cover
- Could cause 100+ second load times for large grids

#### localStorage Caching
- Caching implemented (good)
- No cache invalidation strategy (bad)
- Silently uses stale data without version checking

#### Inefficient Rendering
```javascript
// In useTowns.js - no memoization of generated URLs:
new URL('@/assets/icons/towns/small.png', import.meta.url).href
// Called every time a town is added - should be cached
```

#### Missing Optimizations
- No lazy images
- No intersection observer for map rendering
- No virtual scrolling for lists
- Geoman library imported but unused (overhead)

### Map-Specific Issues
- Leaflet rendering 100+ markers without clustering
- No level-of-detail rendering
- All town popups rendered on click (not virtual)

### Recommendations
- Implement lazy code splitting for views
- Add async component loading with suspense
- Cache URL generation for icons
- Implement Leaflet marker clustering
- Add request cancellation for API calls
- Create request queue for API calls
- Implement virtual scrolling for town lists

---

## 9. TypeScript Analysis

### Current Status
No TypeScript used

### Recommended Migration Strategy

#### Immediate Benefits
- Type safety for props (currently validated at runtime only)
- API response type definitions
- Store state type definitions
- Better IDE autocomplete

#### Example Implementation
```typescript
interface Player {
  id: number
  name: string
  cash: number
  isTurn: boolean
  color: string
  position: number
}

interface PlayerState {
  players: Ref<Player[]>
}

export const usePlayerStore = defineStore('playerStore', () => {
  // Type-safe implementation
})
```

#### Priority Files to Convert
1. All stores (data types)
2. API composables (response types)
3. Component props/emits

---

## 10. Summary Table

| Category | Issue | Severity | Effort |
|----------|-------|----------|--------|
| Dependencies | Unused geoman, leaflet-textpath | Medium | Low |
| Dependencies | No TypeScript | High | High |
| Structure | Unused/incomplete files | Medium | Low |
| Structure | Store not connected to UI | High | Medium |
| Vue 3 | 89 console.logs in production | Medium | Medium |
| Vue 3 | Missing error handling | High | High |
| State | No error/loading states | High | Medium |
| State | Complex towns.js (270 lines) | Medium | Medium |
| Code Quality | No logging system | Medium | Medium |
| Code Quality | Hardcoded magic numbers | Low | Low |
| Build | Bundle size warning (555 kB) | High | High |
| Build | No code splitting | High | High |
| CSS | Full Bulma included (733 kB) | High | Medium |
| CSS | Image import issue in build | Low | Low |
| Performance | No lazy loading | High | High |
| Performance | Sequential API calls | High | Medium |

---

## Prioritized Action Plan

### Phase 1 - Stability (High Impact, Lower Effort)
1. Add error/loading states to stores
2. Remove console.logs / add logging system
3. Connect PlayerStore to UI flow
4. Remove unused dependencies
5. Fix image import in WelcomeView.vue

### Phase 2 - Performance (Medium Effort)
1. Implement code splitting for views
2. Optimize Bulma CSS imports
3. Add request batching for grid API calls
4. Implement Leaflet marker clustering
5. Add cache invalidation strategy

### Phase 3 - Architecture (Higher Effort)
1. Add TypeScript support
2. Create centralized API layer
3. Implement vue-router
4. Split complex stores (towns.js)
5. Write tests for critical paths

### Phase 4 - Polish
1. Add comprehensive error boundaries
2. Implement virtual scrolling
3. Add responsive design improvements
4. Font optimization
5. Documentation updates
