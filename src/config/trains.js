/**
 * Trains (trains.js)
 *
 * The four kinds of train in Empire Builder, and what it costs to change from
 * one to another.
 *
 * Every player starts with a Freight. A train's speed is how far it may run
 * in a turn; its capacity is how many loads it can carry at once.
 *
 * The board game measures speed in mileposts. Its track is built milepost to
 * milepost; here track is built across grid cells 10 km wide (see grid.js),
 * so a milepost is taken to be one cell, 10 km. A Freight's 9 mileposts are
 * then 90 km of track a turn.
 *
 * @module config/trains
 */

/** How many kilometers of track one of the board game's mileposts stands for */
export const KM_PER_MILEPOST = 10

/** The kind of train every player starts the game with */
export const STARTING_TRAIN = 'freight'

/**
 * Every kind of train, by key. The key is what a save records.
 * `mileposts` is the train's speed per turn, `capacity` the loads it carries.
 */
export const TRAIN_TYPES = Object.freeze({
  freight: { name: 'Freight', mileposts: 9, capacity: 2 },
  fastFreight: { name: 'Fast Freight', mileposts: 12, capacity: 2 },
  heavyFreight: { name: 'Heavy Freight', mileposts: 9, capacity: 3 },
  superfreight: { name: 'Superfreight', mileposts: 12, capacity: 3 }
})

/**
 * The changes a player may make to their train, and what each costs.
 *
 * Upgrading — more speed or more room — costs $20 million in Empire Builder
 * ($20,000 here), the whole of a turn's building allowance, so a player who
 * upgrades builds no track that turn. Swapping speed for room or back (a
 * "crossgrade") costs $5 million and leaves the rest of the allowance to
 * build with. Either way the money comes out of the turn's allowance.
 */
export const TRAIN_CHANGES = Object.freeze([
  { from: 'freight', to: 'fastFreight', cost: 20000 },
  { from: 'freight', to: 'heavyFreight', cost: 20000 },
  { from: 'fastFreight', to: 'superfreight', cost: 20000 },
  { from: 'heavyFreight', to: 'superfreight', cost: 20000 },
  { from: 'fastFreight', to: 'heavyFreight', cost: 5000 },
  { from: 'heavyFreight', to: 'fastFreight', cost: 5000 }
])

/**
 * How far a kind of train runs in one turn, in km.
 * @param {string} type - A key of TRAIN_TYPES
 * @returns {number} Kilometers per turn; 0 for an unknown type
 */
export function trainRangeKm(type) {
  return (TRAIN_TYPES[type]?.mileposts ?? 0) * KM_PER_MILEPOST
}
