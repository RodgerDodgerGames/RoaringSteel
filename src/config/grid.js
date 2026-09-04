export const gridConfig = {
  cellSize: 10000 // in meters
}

/**
 * Tunables for the two public APIs the grid is built from.
 *
 * Neither service publishes a rate limit, so these are deliberately
 * conservative: a state-sized grid is hundreds of cells, and being throttled
 * midway costs more than the extra seconds spent pacing. Turn them up only
 * with a real run to back it up.
 */
export const gridApiConfig = {
  /** Locations per Open-Elevation request (bounded by URL length). */
  elevationBatchSize: 10,
  /** Random pause between elevation batches, in ms. */
  elevationPauseMinMs: 500,
  elevationPauseMaxMs: 2000,

  /** NLCD is queried one cell at a time, so it needs a real ceiling. */
  landCoverConcurrency: 4,
  /** Minimum gap between land cover request starts, in ms. */
  landCoverMinIntervalMs: 120,

  /**
   * Share of land cover lookups allowed to fail before setup is treated as a
   * failure. Some loss is normal, but a throttled run fails most of them, and
   * the resulting grid would otherwise be cached and reused forever.
   */
  maxLandCoverFailureRate: 0.25
}
