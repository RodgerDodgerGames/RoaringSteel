export const gridConfig = {
  cellSize: 10000 // in meters
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
   * How many image pixels should span one cell, for both elevation and land
   * cover. The images are fetched at the coarsest detail that still gives each
   * cell about this many pixels across. Each cell reads only the pixel at its
   * center for now, so this mainly sets how finely that pixel was averaged
   * from the source data: 16 across a 10 km cell is about 600 m per pixel.
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
   * Share of cells allowed to go without data, per source, because the image
   * that covers them failed, before setup is treated as a failure. Some loss
   * is normal, but a broken or throttled source fails most requests, and the
   * resulting grid would otherwise be cached and reused forever.
   */
  maxElevationFailureRate: 0.25,
  maxLandCoverFailureRate: 0.25
}
