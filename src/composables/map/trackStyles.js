/**
 * Track Styles (trackStyles.js)
 *
 * How finished track looks on the map. Track is two lines stacked on the
 * same route, both in the owner's color: the ties, and the rail over them
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
 * The light gray every bridge is drawn in, whoever owns the track. It is
 * not a player's color, so the rail running along the deck still shows.
 */
export const BRIDGE_COLOR = '#bbb'

/**
 * The rail: a line in the owner's color running down the middle of the
 * track. Round caps and joins keep bends smooth and close the gap where
 * two sections meet end to end.
 */
export const RAIL_STYLE = { weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round' }

/**
 * The ties: a wide line drawn as short dashes. Each 2px dash crosses the
 * rail like a tie, with an 8px gap to the next, so ties fall every 10px.
 * They take the owner's color, as the rail does, which is given when the
 * track is drawn, so there is no color here. Butt caps keep the dashes
 * square; round ones would make them blobs. A bevel join does the same at
 * bends: Leaflet's default round join turns a tie that lands on a corner
 * into a blob as wide as the tie line.
 *
 * The ties and bridges are kept out of Geoman's snapping (`snapIgnore`):
 * they follow the rail's route, so they would only add duplicate snap
 * targets for Geoman to check on every move of the cursor.
 */
export const TIES_STYLE = {
  weight: 13,
  opacity: 1,
  dashArray: '2, 8',
  lineCap: 'butt',
  lineJoin: 'bevel',
  snapIgnore: true
}

/**
 * A bridge's deck: where track crosses water, the ties give way to a solid
 * light gray deck as wide as the ties, so a bridge reads as a plain bar with the
 * rail running along it (see bridges.js for where the bridges are). It is
 * drawn above the ties, so it hides them, and below the rail. Butt caps:
 * the deck ends square, at its posts.
 */
export const BRIDGE_DECK_STYLE = {
  color: BRIDGE_COLOR,
  weight: TIES_STYLE.weight,
  opacity: 1,
  lineCap: 'butt',
  lineJoin: 'round',
  snapIgnore: true
}

/**
 * A bridge's posts: a round post at each end of the deck, a little wider
 * than it, marking where the bridge leaves the bank. Drawn as Leaflet circle
 * markers, whose radius is in screen pixels, so they keep their size at
 * every zoom as the deck's width does.
 */
export const BRIDGE_POST_STYLE = {
  radius: TIES_STYLE.weight / 2 + 1.5,
  color: BRIDGE_COLOR,
  weight: 0,
  fillColor: BRIDGE_COLOR,
  fillOpacity: 1,
  snapIgnore: true
}
