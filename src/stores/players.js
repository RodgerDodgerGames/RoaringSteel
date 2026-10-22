/**
 * Player Store (players.js)
 *
 * Manages player data and turn order for the game.
 * Handles player creation, updates, removal, and turn cycling.
 *
 * Player Object Structure:
 * {
 *   id: number,        // Unique player ID (1-indexed)
 *   name: string,      // Player display name
 *   cash: number,      // Current money (starts at 0 or specified amount)
 *   isTurn: boolean,   // True if it's this player's turn
 *   color: string,     // Player's chosen color
 *   position: number,  // Board position (for future use)
 *   trackSpentThisTurn: number // Spent on track this turn, against the budget
 * }
 *
 * @module stores/players
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { gameRules } from '@/config/game'

export const usePlayerStore = defineStore('playerStore', () => {
  // STATE

  /** Array of player objects in turn order */
  const players = ref([])

  /**
   * Player entries being edited on the setup screen, before the game starts.
   * Kept separate from `players` so a half-typed roster never has to satisfy
   * the validation that real players do.
   */
  const draftPlayers = ref([])

  /** Monotonic id source for drafts, so ids stay stable across removals */
  let nextDraftId = 1

  /** Loading state for async operations */
  const isLoading = ref(false)

  /** Error state for failed operations */
  const error = ref(null)

  // Getters
  /**
   * Get the currently active player.
   * @returns {Object} The active player object.
   */
  const activePlayer = computed(() => players.value.find((player) => player.isTurn))

  /**
   * The player who gets the turn when the active player ends theirs: the next
   * one in turn order, wrapping from the last back to the first. If nobody
   * holds the turn yet, that is the first player.
   *
   * `nextTurn` hands the turn to exactly this player, so anything that names
   * who is up next (the End Turn button) cannot disagree with what happens.
   *
   * @returns {Object|undefined} The next player, or undefined with no players.
   */
  const nextPlayer = computed(() => {
    if (players.value.length === 0) return undefined

    // -1 when nobody holds the turn, which the +1 below turns into the first
    const activeIndex = players.value.findIndex((player) => player.isTurn)
    return players.value[(activeIndex + 1) % players.value.length]
  })

  /**
   * Check if there are any players in the game.
   * @returns {boolean} True if players exist.
   */
  const hasPlayers = computed(() => players.value.length > 0)

  /**
   * A player's colour, looked up by id. Used to paint each player's track in
   * their colour, so anything on the map can be traced back to its owner.
   *
   * An unknown id gives null rather than throwing: track is drawn for every
   * segment in a save, and a segment whose owner is missing (a damaged or
   * hand-edited save) should still be drawn, just without an owner's colour.
   *
   * @param {number} id The player's ID.
   * @returns {string|null} The player's colour, or null for an unknown player.
   */
  function colorOf(id) {
    return players.value.find((player) => player.id === id)?.color ?? null
  }

  // Actions
  /**
   * Add a new player to the game.
   * @param {{name: string, color: string, cash?: number}} player The player to add.
   * @returns {boolean} True if player was added successfully.
   */
  function addPlayer(player) {
    error.value = null

    // Validate player object
    if (!player || typeof player !== 'object') {
      error.value = 'Invalid player object'
      return false
    }

    // Validate required fields
    if (!player.name || typeof player.name !== 'string') {
      error.value = 'Player must have a valid name'
      return false
    }

    if (!player.color || typeof player.color !== 'string') {
      error.value = 'Player must have a valid color'
      return false
    }

    // Validate name is not empty
    if (player.name.trim().length === 0) {
      error.value = 'Player name cannot be empty'
      return false
    }

    // Check for duplicate names
    const duplicateName = players.value.some(
      (p) => p.name.toLowerCase() === player.name.toLowerCase()
    )
    if (duplicateName) {
      error.value = `Player "${player.name}" already exists`
      return false
    }

    try {
      players.value.push({
        id: players.value.length + 1,
        name: player.name,
        cash: player.cash || 0,
        isTurn: false,
        color: player.color,
        position: 0,
        trackSpentThisTurn: 0
      })
      return true
    } catch (e) {
      error.value = `Failed to add player: ${e.message}`
      return false
    }
  }

  /**
   * Update an existing player.
   * @param {number} id The ID of the player to update.
   * @param {Object} updates The updates to apply to the player.
   * @returns {boolean} True if player was updated successfully.
   */
  function updatePlayer(id, updates) {
    error.value = null

    // Validate id
    if (!id || typeof id !== 'number') {
      error.value = 'Invalid player ID'
      return false
    }

    // Validate updates
    if (!updates || typeof updates !== 'object') {
      error.value = 'Invalid updates object'
      return false
    }

    const player = players.value.find((p) => p.id === id)
    if (!player) {
      error.value = `Player with ID ${id} not found`
      return false
    }

    try {
      // Validate name if being updated
      if (updates.name !== undefined) {
        if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
          error.value = 'Player name must be a non-empty string'
          return false
        }

        // Check for duplicate names (excluding self)
        const duplicateName = players.value.some(
          (p) => p.id !== id && p.name.toLowerCase() === updates.name.toLowerCase()
        )
        if (duplicateName) {
          error.value = `Player "${updates.name}" already exists`
          return false
        }
      }

      Object.assign(player, updates)
      return true
    } catch (e) {
      error.value = `Failed to update player: ${e.message}`
      return false
    }
  }

  /**
   * Remove a player from the game.
   * @param {number} id The ID of the player to remove.
   * @returns {boolean} True if player was removed successfully.
   */
  function removePlayer(id) {
    error.value = null

    // Validate id
    if (!id || typeof id !== 'number') {
      error.value = 'Invalid player ID'
      return false
    }

    const playerExists = players.value.some((p) => p.id === id)
    if (!playerExists) {
      error.value = `Player with ID ${id} not found`
      return false
    }

    try {
      players.value = players.value.filter((player) => player.id !== id)
      return true
    } catch (e) {
      error.value = `Failed to remove player: ${e.message}`
      return false
    }
  }

  /**
   * Begin the game by giving the first player in turn order the turn.
   * Any turn already assigned is cleared, so this is safe to call more than once.
   * @returns {boolean} True if the first turn was assigned successfully.
   */
  function startGame() {
    error.value = null

    if (players.value.length === 0) {
      error.value = 'No players in game'
      return false
    }

    players.value.forEach((player, index) => {
      player.isTurn = index === 0
    })
    return true
  }

  /**
   * Give one specific player the turn, clearing it from everyone else.
   * Used when restoring a save and when repairing inconsistent turn state.
   * @param {number} id The ID of the player who should have the turn.
   * @returns {boolean} True if the turn was assigned successfully.
   */
  function setActivePlayer(id) {
    error.value = null

    const target = players.value.find((p) => p.id === id)
    if (!target) {
      error.value = `Player with ID ${id} not found`
      return false
    }

    players.value.forEach((player) => {
      player.isTurn = player.id === id
    })
    return true
  }

  /**
   * End the current player's turn and switch to the next one.
   * @returns {boolean} True if turn was advanced successfully.
   */
  function nextTurn() {
    error.value = null

    if (players.value.length === 0) {
      error.value = 'No players in game'
      return false
    }

    try {
      // Read before any flag changes: clearing the current turn first would
      // make nextPlayer answer "the first player" instead
      const next = nextPlayer.value
      players.value.forEach((player) => {
        player.isTurn = player === next
      })
      return true
    } catch (e) {
      error.value = `Failed to advance turn: ${e.message}`
      return false
    }
  }

  // MONEY

  /**
   * What a player has spent on track this turn.
   *
   * Read through a helper because a missing counter has to come back as 0
   * rather than as undefined: `budget - undefined` is NaN, and every
   * comparison against NaN is false, so a player carrying one would sail
   * through the budget check with no limit at all.
   *
   * @param {Object} player The player.
   * @returns {number} Amount spent on track this turn.
   */
  function spentOnTrack(player) {
    return Number.isFinite(player.trackSpentThisTurn) ? player.trackSpentThisTurn : 0
  }

  /**
   * What a player has spent on track so far this turn, looked up by id — the
   * figure the build controls show as allowance used and as the turn's total.
   * @param {number} id The player's ID.
   * @returns {number} Amount spent on track this turn; 0 for an unknown player.
   */
  function trackSpendThisTurn(id) {
    const player = players.value.find((p) => p.id === id)
    return player ? spentOnTrack(player) : 0
  }

  /**
   * How much of this turn's track allowance a player has left.
   * @param {number} id The player's ID.
   * @returns {number} Unspent allowance, never negative.
   */
  function trackBudgetRemaining(id) {
    const player = players.value.find((p) => p.id === id)
    if (!player) return 0

    return Math.max(0, gameRules.trackBudgetPerTurn - spentOnTrack(player))
  }

  /**
   * The most a player could spend on track right now.
   *
   * Cash and allowance bind separately, so the usable figure is whichever runs
   * out first — this is the number the build controls compare a running cost
   * against, and the one a rejected build is measured by.
   *
   * @param {number} id The player's ID.
   * @returns {number} Spendable amount, never negative.
   */
  function availableForTrack(id) {
    const player = players.value.find((p) => p.id === id)
    if (!player) return 0

    return Math.min(player.cash, trackBudgetRemaining(id))
  }

  /**
   * Take money off a player.
   *
   * Refuses rather than clamps: a purchase a player cannot cover has to fail as
   * a purchase, because silently charging them what little they have would hand
   * them the goods anyway.
   *
   * @param {number} id The player's ID.
   * @param {number} amount How much to deduct.
   * @returns {boolean} True if the player was charged.
   */
  function spendCash(id, amount) {
    error.value = null

    const player = players.value.find((p) => p.id === id)
    if (!player) {
      error.value = `Player with ID ${id} not found`
      return false
    }

    if (!Number.isFinite(amount) || amount < 0) {
      error.value = 'Amount spent must be a non-negative number'
      return false
    }

    if (amount > player.cash) {
      error.value = `${player.name} has ${player.cash} and cannot spend ${amount}`
      return false
    }

    player.cash -= amount
    return true
  }

  /**
   * Charge a player for track, against both their cash and this turn's budget.
   * @param {number} id The player's ID.
   * @param {number} amount What the track costs.
   * @returns {boolean} True if the player was charged.
   */
  function spendOnTrack(id, amount) {
    error.value = null

    const player = players.value.find((p) => p.id === id)
    if (!player) {
      error.value = `Player with ID ${id} not found`
      return false
    }

    if (!Number.isFinite(amount) || amount < 0) {
      error.value = 'Amount spent must be a non-negative number'
      return false
    }

    // Checked before the cash, so a player who can afford it but has used up
    // the turn's allowance is told which limit they actually hit
    if (amount > trackBudgetRemaining(id)) {
      error.value = `${player.name} has ${trackBudgetRemaining(id)} left to build with this turn`
      return false
    }

    // spendCash sets its own error if the player cannot cover it
    if (!spendCash(id, amount)) return false

    player.trackSpentThisTurn = spentOnTrack(player) + amount
    return true
  }

  /**
   * Give back what a section of track cost, when it is torn up on the same turn
   * it was built. The allowance is returned along with the cash — the track was
   * never built as far as the turn is concerned.
   * @param {number} id The player's ID.
   * @param {number} amount What the track cost.
   * @returns {boolean} True if the player was refunded.
   */
  function refundTrackSpend(id, amount) {
    error.value = null

    const player = players.value.find((p) => p.id === id)
    if (!player) {
      error.value = `Player with ID ${id} not found`
      return false
    }

    if (!Number.isFinite(amount) || amount < 0) {
      error.value = 'Amount refunded must be a non-negative number'
      return false
    }

    player.cash += amount
    // A refund can only ever hand back what this turn's building took, so the
    // counter floors at zero rather than going negative and quietly granting a
    // larger allowance than the rules allow
    player.trackSpentThisTurn = Math.max(0, spentOnTrack(player) - amount)
    return true
  }

  /**
   * Start a player's build allowance over. Called as their turn ends, so the
   * budget they come back to is a full one.
   * @param {number} id The player's ID.
   * @returns {boolean} True if the player was found and reset.
   */
  function resetTrackSpend(id) {
    const player = players.value.find((p) => p.id === id)
    if (!player) return false

    player.trackSpentThisTurn = 0
    return true
  }

  /**
   * Add an entry to the setup roster.
   * Drafts are not validated — the setup screen is where a name gets typed.
   * @param {{name?: string, color?: string}} draft The draft to add.
   * @returns {Object} The stored draft, including its generated id.
   */
  function addDraftPlayer({ name = '', color = '' } = {}) {
    const draft = { id: nextDraftId++, name, color }
    draftPlayers.value.push(draft)
    return draft
  }

  /**
   * Update a setup roster entry.
   * @param {number} id The id of the draft to update.
   * @param {{name?: string, color?: string}} updates The fields to change.
   * @returns {boolean} True if the draft was found and updated.
   */
  function updateDraftPlayer(id, updates) {
    if (!updates || typeof updates !== 'object') return false

    const draft = draftPlayers.value.find((d) => d.id === id)
    if (!draft) return false

    Object.assign(draft, updates)
    return true
  }

  /**
   * Remove a setup roster entry.
   * @param {number} id The id of the draft to remove.
   * @returns {boolean} True if the draft was found and removed.
   */
  function removeDraftPlayer(id) {
    const exists = draftPlayers.value.some((d) => d.id === id)
    if (!exists) return false

    draftPlayers.value = draftPlayers.value.filter((d) => d.id !== id)
    return true
  }

  /**
   * Replace the players in the game with the current setup roster.
   * @param {{cash?: number}} options Starting cash for each player.
   * @returns {boolean} True if every draft became a player.
   */
  function commitDraftPlayers({ cash = 0 } = {}) {
    error.value = null

    if (draftPlayers.value.length === 0) {
      error.value = 'No players to start the game with'
      return false
    }

    const previous = players.value
    players.value = []

    const committed = draftPlayers.value.every((draft) =>
      addPlayer({ name: draft.name.trim(), color: draft.color, cash })
    )

    // All or nothing: a rejected draft must not leave a half-built roster
    if (!committed) {
      const failure = error.value
      players.value = previous
      error.value = failure
    }

    return committed
  }

  /**
   * Drop setup roster entries that were left blank.
   * Adding a row is cheap and reversible, so an unfilled one is treated as
   * "never mind" rather than as an error the user has to go back and clear.
   * @returns {number} How many blank drafts were removed.
   */
  function pruneEmptyDraftPlayers() {
    const kept = draftPlayers.value.filter((draft) => draft.name.trim().length > 0)
    const removed = draftPlayers.value.length - kept.length

    if (removed > 0) {
      draftPlayers.value = kept
    }
    return removed
  }

  /**
   * Clear the setup roster.
   */
  function resetDraftPlayers() {
    draftPlayers.value = []
    nextDraftId = 1
  }

  /**
   * Clear all players and errors from the store.
   */
  function reset() {
    players.value = []
    error.value = null
    isLoading.value = false
    resetDraftPlayers()
  }

  /**
   * Sets the complete players array (used for loading saved games).
   * @param {Array} playersArray - Array of player objects
   */
  function setPlayers(playersArray) {
    if (Array.isArray(playersArray)) {
      // Saves written before track was charged for carry no spend counter, and
      // an undefined one turns every later budget check into NaN
      players.value = playersArray.map((player) => ({
        ...player,
        trackSpentThisTurn: Number.isFinite(player.trackSpentThisTurn)
          ? player.trackSpentThisTurn
          : 0
      }))
    }
  }

  return {
    // state
    players,
    draftPlayers,
    isLoading,
    error,
    // getters
    activePlayer,
    nextPlayer,
    hasPlayers,
    colorOf,
    // actions
    addPlayer,
    updatePlayer,
    removePlayer,
    startGame,
    setActivePlayer,
    nextTurn,
    trackSpendThisTurn,
    trackBudgetRemaining,
    availableForTrack,
    spendCash,
    spendOnTrack,
    refundTrackSpend,
    resetTrackSpend,
    addDraftPlayer,
    updateDraftPlayer,
    removeDraftPlayer,
    pruneEmptyDraftPlayers,
    commitDraftPlayers,
    resetDraftPlayers,
    reset,
    setPlayers
  }
})
