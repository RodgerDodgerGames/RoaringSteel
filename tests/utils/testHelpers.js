/**
 * Test Helper Utilities
 *
 * Shared utilities for testing components and composables.
 * Includes mock factories and common test data.
 */

/**
 * Creates a mock player object for testing
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock player object
 */
export function createMockPlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    cash: 0,
    isTurn: false,
    color: 'red',
    position: 0,
    ...overrides
  }
}

/**
 * Creates multiple mock players for testing
 * @param {number} count - Number of players to create
 * @param {Function} customizer - Optional function to customize each player
 * @returns {Array} Array of mock player objects
 */
export function createMockPlayers(count, customizer = null) {
  const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange']
  return Array.from({ length: count }, (_, i) => {
    const player = {
      id: i + 1,
      name: `Player ${i + 1}`,
      cash: 0,
      isTurn: i === 0, // First player starts
      color: colors[i % colors.length],
      position: 0
    }
    return customizer ? customizer(player, i) : player
  })
}

/**
 * Creates a mock town object for testing
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock town object
 */
export function createMockTown(overrides = {}) {
  return {
    name: 'Test Town',
    lat: 40.7128,
    lon: -74.006,
    population: 100000,
    industries: [],
    ...overrides
  }
}

/**
 * Creates a mock GeoJSON region for testing
 * @param {string} name - Region name
 * @returns {Object} GeoJSON FeatureCollection
 */
export function createMockRegion(name = 'Test Region') {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-74.0, 40.7],
              [-73.9, 40.7],
              [-73.9, 40.8],
              [-74.0, 40.8],
              [-74.0, 40.7]
            ]
          ]
        }
      }
    ]
  }
}

/**
 * Creates a mock Leaflet map object for testing
 * @returns {Object} Mock map with common Leaflet methods
 */
export function createMockMap() {
  return {
    getZoom: () => 10,
    setZoom: () => {},
    getCenter: () => ({ lat: 40, lng: -100 }),
    setView: () => {},
    on: () => {},
    off: () => {},
    addLayer: () => {},
    removeLayer: () => {},
    eachLayer: () => {},
    distance: () => 100,
    getContainer: () => ({ style: {} }),
    pm: {
      enableDraw: () => {},
      disableDraw: () => {},
      setGlobalOptions: () => {},
      setLang: () => {},
      toggleGlobalRemovalMode: () => {},
      Draw: {
        Line: {
          _createVertex: () => {},
          _finishShape: () => {},
          _hintMarker: { on: () => {}, off: () => {}, setTooltipContent: () => {} }
        }
      }
    }
  }
}

/**
 * Creates a mock Leaflet layer group for testing
 * @param {Array} layers - Initial layers
 * @returns {Object} Mock layer group
 */
export function createMockLayerGroup(layers = []) {
  const _layers = [...layers]
  return {
    getLayers: () => _layers,
    addLayer: (layer) => _layers.push(layer),
    removeLayer: (layer) => {
      const idx = _layers.indexOf(layer)
      if (idx > -1) _layers.splice(idx, 1)
    },
    eachLayer: (fn) => _layers.forEach(fn),
    clearLayers: () => (_layers.length = 0)
  }
}

/**
 * Waits for Vue's next tick in tests
 * @returns {Promise} Resolves after next tick
 */
export function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
