/**
 * Game Rules (game.js)
 *
 * The money side of the Empire Builder rules, in one place so the numbers the
 * game is balanced around are not scattered through components.
 *
 * Empire Builder counts money in millions. Here one million is $1,000, so the
 * board game's figures carry straight over: its $20 million building
 * allowance is $20,000 here, its $250 million to win is $250,000.
 *
 * @module config/game
 */

export const gameRules = {
  /** What each player is handed when the game starts: $40 million in Empire Builder. */
  startingCash: 50000,

  /**
   * The most a player may spend on track in one turn.
   *
   * Separate from cash on hand, and the two are checked independently: a rich
   * player is still held to the per-turn allowance, and a poor one cannot
   * spend money they do not have just because the allowance is untouched.
   *
   * Upgrading a train is paid for out of the same allowance (see trains.js),
   * so a turn's money goes on track or on the train, as in Empire Builder.
   */
  trackBudgetPerTurn: 20000,

  /**
   * How many rounds open the game with building only — Empire Builder's
   * "switchback start". Trains do not run in these rounds: each player just
   * lays track (or upgrades their train) with that turn's allowance. The
   * rounds alternate direction, first player to last and then back again,
   * so the order is fair on the way out and the way back (see turnOrder.js).
   */
  buildingRounds: 2,

  /**
   * What track over land costs: Empire Builder's $1 million a milepost of
   * clear ground, here $1,000 per speed unit (see composables/boardScale.js),
   * scaled up for built-up, broken or climbing ground. (Water is bridged instead, see
   * `bridges`, and reaching a town adds its entry fee, see `townEntry`.)
   *
   * Priced per speed unit rather than per km or per grid cell, so a turn's
   * $20,000 allowance builds the same number of speed units of ordinary
   * ground on every board, whatever the board's size or its cells': 20 at
   * the board game's rate, a little over two turns of a Freight's running.
   *
   * A cell's terrain cost has three parts:
   * - land cover: the average cost of the ground in the cell, from the
   *   table in config/nlcd.js (grassland 70, forest 350, a city 500–800)
   * - roughness: `roughnessCost` times how broken the cell's ground is — the
   *   average steepness between neighboring elevation pixels inside it, as a
   *   grade (rise over run: 0.1 is 10%). It stands for the cuts and fills a
   *   line needs over hills too small to show from cell to cell.
   * - climb: how steeply the line climbs into the cell from the one before,
   *   measured along the line from the two cells' average heights (see
   *   composables/map/climb.js and `climbPoints` in trackCost.js). Up to
   *   `climb.rulingGrade` it adds nothing; past it, it is priced as the
   *   extra track a railroad lays to hold that grade: climbing at twice the
   *   ruling grade costs one extra ordinary cell, at three times two extra.
   *
   * Each part is multiplied by its own tuning knob (`knobs`) and the three are
   * added. The total is read against `openGroundCost`, the terrain cost of
   * ordinary ground — Empire Builder's clear terrain, the most common ground
   * on its map: a cell at that cost is priced at `perSpeedUnit` per speed
   * unit of its width, one twice as costly at twice that. Measured on real
   * boards cut to the cell budget (2026-11-04), before the knobs: Colorado's
   * plains run about 175–245, and the middle of all the cells is 560 in
   * Colorado, 610 in Maryland and 710 in Massachusetts, so a typical cell
   * costs 1.2–1.6 times ordinary ground. (On 2026-11-18, land cover plus the
   * old slope came to a middle of 435–455 on Minnesota and two Rocky Mountain
   * boards.)
   *
   * `roughnessCost` is set so ground as broken as a 10% grade adds a whole
   * ordinary ground's worth, before the knob.
   *
   * `climb.rulingGrade` is the grade a railroad is laid to: 2%, about the
   * steepest main lines run. Cells' average heights smooth the ground out, so
   * a climb measured between them is gentler than the steepest pitch on it.
   *
   * `maxTerrainFactor` caps how much dearer than ordinary ground a cell can
   * be: Empire Builder's alpine mileposts, its dearest ground, cost 5 times
   * its clear ones. The steepest cells would otherwise cost more than a
   * whole turn's allowance, and no one could build across them. The cap is
   * on the cost after the knobs, against ordinary ground at the land cover
   * knob, so worse ground never comes out cheaper.
   *
   * `knobs` are for tuning after playtests: raise one to make that part of
   * the terrain dearer, lower it to make it cheaper. At 1 each, track costs
   * the board game's rate. Bridges and town entry are not affected.
   *
   * Land cover started at 0.5, half the board game's rate. With 1, on a
   * Maryland board (bench run, 2026-11-05) the cheapest first delivery a
   * player was dealt cost a little over the $40,000 a player starts with —
   * nobody could afford one, and the computer players threw in their hands
   * every turn and never built. At 0.5, computer players won on Colorado,
   * Maryland and Massachusetts boards in 39–70 rounds.
   *
   * Roughness and climb replaced a single slope (the steeper of a cell's
   * roughness and its grade to its neighbors, which in practice was always
   * the roughness) on 2026-11-18 (#160). On a bench of Minnesota and two
   * Rocky Mountain boards, roughness 0.15 and climb 0.5 brought topography
   * from about 67% of mountain track prices to about 60%, and mountain
   * prices down by about a seventh, leaving Minnesota's nearly as they were.
   */
  trackPrice: {
    perSpeedUnit: 1000,
    openGroundCost: 450,
    roughnessCost: 4500,
    climb: {
      rulingGrade: 0.02
    },
    maxTerrainFactor: 5,
    knobs: {
      landCover: 0.5,
      roughness: 0.15,
      climb: 0.5
    }
  },

  /**
   * What it costs to build track into a town, on top of the track itself, by
   * the town's size: Empire Builder's $3 million for small and medium cities
   * and $5 million for major ones.
   *
   * A player pays once per town, when a section of their track first reaches
   * it — has a point on the town, so trains can stop there. A line that only
   * passes through the town's cell does not reach it and does not pay, and
   * nor does the town a section starts from.
   */
  townEntry: {
    small: 3000,
    medium: 3000,
    large: 5000
  },

  /**
   * Bridges: what it costs to carry track over water, and how far it may go.
   * The water is Natural Earth's rivers, lakes and sea (see
   * composables/map/water.js and scripts/build-water-data.mjs).
   *
   * Lakes and the sea are grid cells of water. A crossing of them pays
   * `perSpeedUnit` for every speed unit of water it spans (see
   * composables/boardScale.js), as track pays per speed unit of land, so a
   * bridge costs the same share of a turn's allowance on every board. A
   * crossing longer than `maxSpeedUnits` cannot be built at all: then the
   * line has to go around. A crossing may reach out over water beyond the
   * region's border, as long as it comes back to the region's land.
   *
   * Rivers are lines with no width, so a river is not water cells: track may
   * run alongside one freely, and pays `riverCrossing` each time it crosses
   * one, however wide the river. No river is too wide to bridge.
   *
   * Both prices are $2,000, decided 2026-11-05. The limit of 3 speed units
   * is about 17 km on a board Colorado's size and about 14 km on a small one.
   */
  bridges: {
    perSpeedUnit: 2000,
    maxSpeedUnits: 3,
    riverCrossing: 2000
  },

  /**
   * How track may meet track already built. As in Empire Builder, where lines
   * may cross at a milepost but never share the way between two, new track
   * may cross built track but not run alongside it.
   *
   * Counted in grid cells, the board's mileposts, so the rule is the same on
   * every board. New track is "beside" built track wherever it is within
   * `nearCells` of a cell of it — half a cell, the width of the band a line
   * runs down the middle of. It may be beside built track for at most
   * `maxBesideCells` at a stretch. Crossing square on takes about one cell of
   * that (half a cell each side); the stretch grows as the angle flattens, so
   * two cells lets a line cross at anything steeper than about 30°, and stops
   * it running along, or weaving along, a line.
   */
  trackSpacing: {
    nearCells: 0.5,
    maxBesideCells: 2
  },

  /**
   * What a player pays another for running on their track: Empire Builder's
   * $4 million, paid to each owner whose track the train used, once per turn
   * however much of that owner's track it ran on.
   */
  trackUseFee: 4000,

  /**
   * How a game is won (see victory.js). The first player to have both this
   * much cash and a network joining enough of the region's major cities wins
   * at once.
   *
   * Empire Builder asks for $250 million and six of its seven major cities.
   * A region here has however many major cities its census data gives it, so
   * the six-of-seven is kept as a share: `majorCityShare` of them, rounded up
   * (all of them up to six, six of seven, seven of eight, nine of ten).
   */
  victory: {
    cash: 250000,
    majorCityShare: 6 / 7
  },

  /**
   * What a demand pays (see payoffs.js). As in Empire Builder, a delivery
   * pays more the harder the commodity is to bring in: here, by what a
   * straight line of track would cost to build from the producing town
   * whose line is cheapest to the destination — its terrain, bridges and
   * river crossings priced as track is (see `trackPrice` and `bridges`) —
   * rounded to the nearest thousand.
   *
   * `trackCostMultiple` is how many times that price a delivery pays. At 2,
   * a first delivery on a new, straight line pays for the line about twice
   * over. With the land cover knob at 0.5, ordinary ground costs $500 per speed
   * unit, so a haul over it pays $1,000 per speed unit, the board game's
   * rate. Because payoffs follow track prices, turning the track knobs up or
   * down turns payoffs up or down with them.
   *
   * `unbridgeableWater` is what each cell of a stretch of lake or sea too
   * long to bridge adds, as a share of a bridge cell, past the cells a
   * bridge could span: a stand-in for the detour round it (see
   * `waterStretchPrice` in payoffs.js). At 0.5 each adds half a bridge.
   *
   * `route` brings the straight line's price part of the way toward the
   * cheapest route a computer player's search would find (see
   * `blendedPricer` in payoffs.js): price = straight · (route / straight) ^
   * `weight`. Players build fairly straight, but go round the worst of a
   * mountain range. At 0 payoffs follow the straight line, at 1 the route.
   * On a bench of three boards (2026-11-18) a route cost about a third of
   * the straight line in the Rocky Mountains and about two thirds in
   * Minnesota, so at 0.5 mountain hauls pay about 0.6 of the straight line
   * and Minnesota's about 0.8. The routes are searched on a coarse copy of
   * the grid of no more than `searchCells` cells (see coarseGrid.js): at
   * 20,000, about 1.5 seconds of setup for 60 towns. A coarser grid smooths
   * the ground, so its routes save a little less than the full grid's.
   *
   * `minimum` keeps a delivery between neighbors worth making.
   *
   * `longHaul` rewards the risk of reaching for distant towns: the
   * payoff is multiplied by a bonus that grows exponentially with the haul's
   * share of the map's span (its two furthest-apart towns), up to
   * 1 + maxBonus for the longest possible haul. At a maxBonus of 1, that haul
   * pays double. Raise it to pull players across the map harder, or set it to
   * 0 for no bonus. It is measured on distance, not on price, as the terrain
   * is already in the price.
   *
   * `steepness` sets how much of the bonus is held back for the very longest
   * hauls. At 2, a haul a quarter of the way across pays about 1.1× and one
   * halfway across about 1.27×; at 4, those drop to about 1.03× and 1.12×.
   * At 0 (or below), the bonus grows in a straight line with distance.
   */
  payoffs: {
    trackCostMultiple: 2,
    unbridgeableWater: 0.5,
    route: {
      weight: 0.5,
      searchCells: 20000
    },
    roundTo: 1000,
    minimum: 3000,
    longHaul: {
      maxBonus: 1,
      steepness: 2
    }
  }
}
