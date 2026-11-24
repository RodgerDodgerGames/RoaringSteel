/**
 * Settings for the game map's two views (see composables/map/mapViews.js).
 */
export const mapViewConfig = {
  /**
   * How many pixels across a grid cell is at the Build view's closest zoom,
   * at most. Zoom comes in whole levels, each doubling a cell's size, so the
   * closest zoom is the closest whole level at which a cell is no bigger
   * than this: between half this and this many pixels. Rounding down rather
   * than to the nearest keeps more of the board, and so more of the towns
   * near the one being built from, on screen.
   */
  buildCellPixels: 25,
  /**
   * How many zoom levels out from its closest the Build view may go. At one,
   * the Build view has two zooms, the further showing cells half as wide.
   * The whole region is seen in the Plan view.
   */
  buildZoomSteps: 1,
  /**
   * How far past the edge of the region the Build view may pan, as a share of
   * the region's height and width. Enough to bring towns on the border away
   * from the edge of the screen, not enough to get lost.
   */
  panMargin: 0.1,
  /** Clear space kept around the region in the Plan view, in px */
  planPadding: 16
}

/**
 * The hillshade laid over the satellite imagery on the game map (see
 * MainMap.vue), so mountains, ridges and valleys stand out. It is Esri's
 * World Hillshade: gray tiles, white where ground faces the light and darker
 * where it slopes away. They are blended into the imagery by multiplying
 * ("multiply" blending): white leaves the imagery as it is, gray darkens it,
 * so the imagery keeps its colors and the slopes get shadows.
 */
export const hillshadeConfig = {
  /** Where the tiles are, in Leaflet's {z}/{y}/{x} form */
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
  /**
   * How strong the shading is, from 0 (none) to 1 (the full hillshade).
   * Multiplying dims flat ground a little as well as shading slopes, so the
   * higher this is, the darker the whole map.
   */
  opacity: 0.6,
  /**
   * The closest zoom Esri draws real hillshade at. Past it the server sends
   * a "map data not yet available" tile rather than an error, so Leaflet is
   * told to stretch this zoom's tiles instead of asking for closer ones.
   */
  maxNativeZoom: 16
}

/**
 * How the board's water is drawn (see composables/map/waterLayer.js): the
 * lakes, sea and rivers track has to bridge, and their names.
 */
export const waterStyleConfig = {
  /**
   * How thick a river is drawn, in px, by Natural Earth's rank for it
   * (`rank`, its `scalerank`: lower is more important — the Rio Grande is 4,
   * the Minnesota River 7). The first class whose `maxRank` the river's rank
   * is within sets its weight. Only rivers up to rank 7 are in the water
   * data at all (see scripts/waterFilters.mjs), so two classes are enough:
   * the great rivers (the Mississippi, the Rio Grande and the Southwest's
   * Colorado are 5 or better) thick, the rest thin. Every river costs the
   * same to cross whatever its weight.
   */
  riverWeights: [
    { maxRank: 5, weight: 4 },
    { maxRank: Infinity, weight: 2.5 }
  ],

  /**
   * When a name is shown. Natural Earth gives each river, lake and bay the
   * web-map zoom from which its name is worth showing (`label`, its
   * `min_label`); a name shows once the map is zoomed in at least that far,
   * plus this many levels. Raise it to show fewer names at each zoom, lower
   * it to show more.
   */
  labelZoomOffset: 0
}

/**
 * How bridges are drawn on finished track (see composables/map/bridges.js
 * and BRIDGE_DECK_STYLE in trackStyles.js).
 */
export const bridgeStyleConfig = {
  /**
   * How long a river bridge is drawn, in grid cells. A river is a line, so
   * track crosses it at a single point; the bridge is drawn this long,
   * centered on the crossing, so it can be seen. (What it costs does not
   * change: a river crossing is one price however it is drawn.)
   */
  riverBridgeCells: 2
}
