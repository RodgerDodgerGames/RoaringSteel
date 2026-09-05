export const gridConfig = {
  cellSize: 10000 // in meters
}

/**
 * Tunables for the two public APIs the grid is built from.
 *
 * These are backed by a full Minnesota run (3835 cells, 2026-09-04). That
 * capture showed the previous settings spent 12 of 18 minutes asleep: only
 * ~6 minutes was actual network I/O. It also showed no reason for the caution
 * — zero 429s across 4400 requests, and NLCD's median response time held flat
 * at 62-67ms from the first request to the 3835th, so the service was not
 * degrading under load. The values below are paced off those measurements
 * rather than guesswork. Re-measure before moving them again.
 */
export const gridApiConfig = {
  /**
   * Locations per Open-Elevation request. Bounded by URL length, not by the
   * API: a 50-location request is a 1460-character URL, well inside limits,
   * and replaces 5 round trips with 1. Verified against the live API — it
   * returns exactly 50 results in ~550ms.
   */
  elevationBatchSize: 50,
  /**
   * Random pause between elevation batches, in ms. The old 500-2000ms window
   * averaged 1250ms and cost 478s of sleeping to cover 78s of requests.
   */
  elevationPauseMinMs: 200,
  elevationPauseMaxMs: 500,

  /** NLCD is queried one cell at a time, so it needs a real ceiling. */
  landCoverConcurrency: 6,
  /**
   * Minimum gap between land cover request starts, in ms. This is a pool-wide
   * floor (see `mapWithConcurrency`), so it — not `landCoverConcurrency` — is
   * what actually caps throughput. At the old 120ms the pool was limited to
   * 8.3 req/s and barely had one request in flight, making the concurrency
   * setting inert. 25ms puts the ceiling at 40 req/s with the pool as the
   * backstop. Confirmed by a 240-request burst at these exact settings: 37.7
   * req/s sustained, 240/240 succeeded, and the median latency did not drift
   * between the first and second half of the run.
   */
  landCoverMinIntervalMs: 25,

  /**
   * Observed per-request latency, in ms, used only to weight the progress bar
   * — never to pace anything. Without these the bar models sleep time alone,
   * which was fair when pacing dominated but is not once the pauses come down.
   *
   * Both are measured over a keep-alive connection, which is what the browser
   * uses: NLCD's median held at 61-63ms in both the Minnesota capture and a
   * follow-up burst, and Open-Elevation answered a 50-location batch in
   * ~550ms.
   */
  landCoverRequestMs: 63,
  elevationRequestMs: 550,

  /**
   * How long a single request may stall before it is abandoned, in ms.
   *
   * These are dead-man's switches, not pacing: a stalled connection neither
   * resolves nor rejects, so without a ceiling one hung socket parks setup
   * forever (#85). Both are set far above the measured latencies above — 63ms
   * for a land cover cell, ~550ms for a 50-location elevation batch — so a
   * merely slow response is never mistaken for a dead one. Land cover gets the
   * tighter ceiling because a timeout there costs one cell, where an elevation
   * timeout costs a whole batch of 50.
   */
  landCoverTimeoutMs: 10000,
  elevationTimeoutMs: 20000,

  /**
   * Share of lookups allowed to fail, per phase, before setup is treated as a
   * failure. Some loss is normal, but a throttled run fails most of them, and
   * the resulting grid would otherwise be cached and reused forever.
   *
   * Both phases use the same tolerance — the guard exists to catch a systemic
   * failure such as throttling, which fails most requests, not to trim the odd
   * dropout. Elevation gets its own knob because its failures are coarser: one
   * bad response takes out a whole `elevationBatchSize` of contiguous cells,
   * where land cover fails a single cell at a time.
   */
  maxElevationFailureRate: 0.25,
  maxLandCoverFailureRate: 0.25
}
