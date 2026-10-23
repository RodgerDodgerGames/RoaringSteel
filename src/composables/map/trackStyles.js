/**
 * Track Styles (trackStyles.js)
 *
 * How finished track looks on the map. Track is three lines stacked on the
 * same route: a dark casing, the ties, and the rail in the owner's color
 * (see useBuildTrack, which draws it). Kept here, rather than inside the
 * build composable, so the map legend can draw its sample of track from the
 * same numbers.
 *
 * @module composables/map/trackStyles
 */

/**
 * What finished track is drawn in when its owner has no color (a damaged
 * save): plain black, the way all track looked before it was colored.
 */
export const UNOWNED_TRACK_COLOR = 'black'

/**
 * The dark gray that frames every player's track, so the paler player
 * colors (yellow, lime) still stand out against the light map.
 */
export const TRACK_EDGE_COLOR = '#222'

/**
 * The rail: a line in the owner's color running down the middle of the
 * track. Round caps and joins keep bends smooth and close the gap where
 * two sections meet end to end.
 */
export const RAIL_STYLE = { weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round' }

/**
 * The casing: a dark line under the rail, wider than it, so the rail has a
 * thin dark edge on both sides.
 *
 * The casing and ties are kept out of Geoman's snapping (`snapIgnore`):
 * they follow the rail's route exactly, so they would only add duplicate
 * snap targets for Geoman to check on every move of the cursor.
 */
export const CASING_STYLE = {
  color: TRACK_EDGE_COLOR,
  weight: 7,
  opacity: 1,
  lineCap: 'round',
  lineJoin: 'round',
  snapIgnore: true
}

/**
 * The ties: a wide line drawn as short dashes. Each 2px dash crosses the
 * rail like a tie, with an 8px gap to the next, so ties fall every 10px.
 * Butt caps keep the dashes square; round ones would make them blobs. A
 * bevel join does the same at bends: Leaflet's default round join turns a
 * tie that lands on a corner into a dark blob as wide as the tie line.
 */
export const TIES_STYLE = {
  color: TRACK_EDGE_COLOR,
  weight: 13,
  opacity: 1,
  dashArray: '2, 8',
  lineCap: 'butt',
  lineJoin: 'bevel',
  snapIgnore: true
}
