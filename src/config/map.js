/**
 * Settings for the game map's two views (see composables/map/mapViews.js).
 */
export const mapViewConfig = {
  /**
   * How many pixels across a grid cell is at the Build view's closest zoom:
   * enough to aim at one cell with a mouse (about a centimeter on screen).
   * Zoom comes in whole levels, each doubling a cell's size, so the closest
   * zoom is whichever puts a cell nearest this, about 23 to 45 pixels. Any
   * closer would show less of the map and nothing new: a cell costs the same
   * all the way across.
   */
  buildCellPixels: 32,
  /**
   * How many zoom levels out from its closest the Build view may go. At
   * three, a cell is an eighth of its closest size at the furthest: about
   * four pixels. The whole region is seen in the Plan view.
   */
  buildZoomSteps: 3,
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
