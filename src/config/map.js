/**
 * Settings for the game map's two views (see composables/map/mapViews.js).
 */
export const mapViewConfig = {
  /**
   * The Build view's closest zoom. At zoom 9 a 10 km grid cell is 37–48 px
   * across, depending on latitude (37 in southern Texas, 48 in North Dakota):
   * about a centimeter on screen, enough to draw track cell by cell.
   */
  buildMaxZoom: 9,
  /**
   * The Build view's furthest zoom: three steps out from the closest, so each
   * cell is an eighth of the size. Regions too big to see whole at this zoom
   * are seen whole in the Plan view.
   */
  buildMinZoom: 6,
  /**
   * How far past the edge of the region the Build view may pan, as a share of
   * the region's height and width. Enough to bring towns on the border away
   * from the edge of the screen, not enough to get lost.
   */
  panMargin: 0.1,
  /** Clear space kept around the region in the Plan view, in px */
  planPadding: 16
}
