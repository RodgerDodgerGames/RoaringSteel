/**
 * How the board's grid is cut, and what its terrain costs.
 *
 * The grid's cells are the board's mileposts: track is priced, and towns are
 * placed, cell by cell. There are as many as `cellBudget` allows, so a small
 * board has small cells and a big one bigger cells (see `cellSizeFor` in
 * composables/boardScale.js). What a cell's size changes is how finely the
 * terrain is read; how far trains run and what track costs per km are set by
 * the board's size, not the cells' (see boardScale.js).
 */
export const gridConfig = {
  /**
   * How many cells the grid's rectangle (the region's bounding box) is cut
   * into, about. Everything that grows with the cell count is held in check
   * by it: the terrain downloads at setup (about 60 land cover pictures and
   * 1,000 elevation tiles at 250,000, roughly 25 seconds), the grid's size in
   * the browser's storage and in a saved game (about 2.5 MB), and how long a
   * computer player's route search takes (about half a second each on a
   * desktop, three to five times that on a phone).
   */
  cellBudget: 250000,

  /**
   * The smallest a cell may be, in meters, however small the region. The
   * land cover is mapped in 30 m squares; a cell is read from a few hundred
   * pixels (see `pixelsPerCell`), and at much below this they would be the
   * same few squares read over and over.
   */
  minCellSize: 250,

  /**
   * What a cell's slope adds to its terrain cost, per unit of grade (rise
   * over run: a 10% grade is 0.1, adding a tenth of this). See
   * composables/map/terrainCost.js. Set so that, against ordinary ground's
   * terrain cost (`trackPrice.openGroundCost` in game.js), a 10% grade about
   * doubles a cell's price, as Empire Builder's mountains double its clear
   * ground, and a 40% one reaches the cap of five times, its alpine.
   */
  slopeCost: 4500
}

/**
 * Tunables for the two sources the grid's terrain comes from.
 *
 * Both come down as images: elevation as map tiles whose colors encode
 * height (see useElevationTiles.js), land cover as pictures of the NLCD map
 * (see useLandCoverAPI.js). One image answers for hundreds of cells, so a
 * state takes tens of requests rather than the thousands the old one-point-
 * at-a-time lookups needed. Measured 2026-10-26: Texas' elevation, 14,632
 * cells, came down in 90 tiles in 1.8s; Massachusetts' land cover in 6
 * images in 2.5s.
 */
export const gridApiConfig = {
  /**
   * Where the elevation tiles are: the AWS Terrain Tiles, in the "terrarium"
   * encoding. Free, no key, no rate limit, and open to browsers (CORS).
   */
  elevationTileUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  /** The most detailed zoom the tiles are published at */
  elevationMaxZoom: 15,

  /**
   * How many image pixels span one cell, each way, for both elevation and
   * land cover. A cell is read from every pixel inside it — about 256 at 16
   * — so its land cover is a mix and its height an average, with its
   * roughness measured between them (see useElevationTiles.js and
   * useLandCoverAPI.js). Land cover pictures are drawn at exactly this many
   * pixels to a cell; elevation tiles come at the coarsest zoom with at
   * least this many.
   */
  pixelsPerCell: 16,

  /** Width and height of each land cover image, in pixels */
  landCoverImageSize: 1024,

  /** Requests in flight at once, per source */
  elevationConcurrency: 6,
  landCoverConcurrency: 4,

  /**
   * Observed time per request, in ms, used only to weight the progress bar —
   * never to pace anything. A 256-pixel elevation tile took about 120ms
   * (Texas: 90 tiles in 1.8s, 6 at a time); a 1024-pixel land cover image
   * about 0.9s.
   */
  elevationRequestMs: 120,
  landCoverRequestMs: 900,

  /**
   * How long a single request may stall before it is abandoned, in ms.
   *
   * These are dead-man's switches, not pacing: a stalled connection neither
   * resolves nor rejects, so without a ceiling one hung socket parks setup
   * forever (#85). Both are set far above the measured times above so a
   * merely slow response is never mistaken for a dead one.
   */
  elevationTimeoutMs: 20000,
  landCoverTimeoutMs: 30000,

  /**
   * The same for each try at the land cover server's list of years. It
   * answers in under half a second; every new game asks for it, one with a
   * cached grid included, and that game should not sit through long waits
   * on a stalled request before falling back to the cache.
   */
  landCoverYearsTimeoutMs: 10000,

  /**
   * Share of cells allowed to go without data, per source, because the image
   * that covers them failed, before setup is treated as a failure. Some loss
   * is normal, but a broken or throttled source fails most requests, and the
   * resulting grid would otherwise be cached and reused forever.
   */
  maxElevationFailureRate: 0.25,
  maxLandCoverFailureRate: 0.25
}
