/**
 * Trains (trains.js)
 *
 * The four kinds of train in Empire Builder, and what it costs to change from
 * one to another.
 *
 * Every player starts with a Freight. A train's speed is how far it may run
 * in a turn; its capacity is how many loads it can carry at once.
 *
 * Speed is Empire Builder's: 9 for a Freight, 12 for a Fast Freight. It is
 * all the player is shown. How far a speed of 9 runs depends on the board: a
 * train runs its speed in the board's speed units each turn, and the speed
 * unit is set so that a Freight takes about as many turns to cross a board as
 * one of its size should take (see composables/boardScale.js).
 *
 * @module config/trains
 */

/** The kind of train every player starts the game with */
export const STARTING_TRAIN = 'freight'

/**
 * Every kind of train, by key. The key is what a save records.
 * `speed` is how far the train runs per turn, in the board's speed units;
 * `capacity` the loads it carries.
 */
export const TRAIN_TYPES = Object.freeze({
  freight: { name: 'Freight', speed: 9, capacity: 2 },
  fastFreight: { name: 'Fast Freight', speed: 12, capacity: 2 },
  heavyFreight: { name: 'Heavy Freight', speed: 9, capacity: 3 },
  superfreight: { name: 'Superfreight', speed: 12, capacity: 3 }
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
 * How far a kind of train runs in one turn, in km: its speed in the board's
 * speed units.
 * @param {string} type - A key of TRAIN_TYPES
 * @param {number} speedUnitKm - The board's speed unit (see boardScale.js)
 * @returns {number} Kilometers per turn; 0 for an unknown type
 */
export function trainRangeKm(type, speedUnitKm) {
  return (TRAIN_TYPES[type]?.speed ?? 0) * speedUnitKm
}
