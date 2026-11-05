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
