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
  buildCellPixels: 10,
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
 * How the board's water is drawn (see composables/map/waterLayer.js): the
 * lakes, sea and rivers track has to bridge, and their names.
 */
export const waterStyleConfig = {
  /**
   * How thick a river is drawn, in px, by Natural Earth's rank for it
   * (`rank`, its `scalerank`: lower is more important — the Rio Grande is 4,
   * a river like the Yampa 10). The first class whose `maxRank` the river's
   * rank is within sets its weight. Drawn this way so the ranks can be judged
   * on real boards before deciding whether river bridges should be priced by
   * them; for now every river costs the same to cross.
   */
  riverWeights: [
    { maxRank: 6, weight: 4 },
    { maxRank: 9, weight: 2.5 },
    { maxRank: Infinity, weight: 1.5 }
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
