/**
 * Run List Store (runList.js)
 *
 * Whether the dock's "Run to" list shows, for the player whose turn it is,
 * the places only other players' track leads to. Most of the time players
 * stick to their own track, so those places are hidden until the player
 * asks for them with the toggle under "Choose on the map" — but riding
 * another player's track is part of the game, so they are always a click
 * away.
 *
 * Each player has their own setting, which stays as they left it from turn
 * to turn. While a player's train is riding someone else's track (see the
 * trains store's `isRidingOthersTrack`), the way on almost surely runs on
 * theirs, so the list shows those places without being asked. The player
 * can still hide them for that ride; once the train is back on its own
 * track, their own setting applies again, and the next ride starts with the
 * places shown.
 *
 * Not saved with the game: it is how the people at the table like the list,
 * not part of the game's state. Settings are kept by player, and players
 * belong to one game, so loading a game or starting a new one forgets them.
 * Choosing on the map is not affected.
 *
 * @module stores/runList
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { usePlayerStore } from './players'
import { useTrainsStore } from './trains'

export const useRunListStore = defineStore('runList', () => {
  const playerStore = usePlayerStore()
  const trainsStore = useTrainsStore()

  // STATE

  /**
   * Each player's own setting, by player id: true to show the places on
   * other players' track. A player with no entry has them hidden.
   */
  const shownByPlayer = ref({})

  /**
   * What each player chose for the ride they are on, by player id, while
   * their train rides someone else's track. A player with no entry has the
   * places shown, the default while riding.
   */
  const shownWhileRiding = ref({})

  // GETTERS

  /** The player whose turn it is */
  const playerId = computed(() => playerStore.activePlayer?.id)

  /** Whether their train is riding someone else's track */
  const isRiding = computed(() => trainsStore.isRidingOthersTrack(playerId.value))

  /**
   * Whether the "Run to" list shows the places only other players' track
   * leads to, for the player whose turn it is: the choice for this ride
   * while riding (shown unless they hid them), their own setting otherwise
   * (hidden unless they showed them).
   */
  const showsOthersTrack = computed(() =>
    isRiding.value
      ? (shownWhileRiding.value[playerId.value] ?? true)
      : Boolean(shownByPlayer.value[playerId.value])
  )

  // ACTIONS

  /**
   * Flips whether the list shows the places on other players' track, for
   * the player whose turn it is. While riding, this only sets the choice
   * for this ride, leaving their own setting as it was for when they are
   * home again.
   */
  function toggleOthersTrack() {
    const choices = isRiding.value ? shownWhileRiding : shownByPlayer
    choices.value = { ...choices.value, [playerId.value]: !showsOthersTrack.value }
  }

  // Once the train is off other players' track, the choice made for that
  // ride is forgotten, so the next ride starts with the places shown again.
  // Watching the player too catches a turn that starts off their track.
  watch([playerId, isRiding], ([id, riding]) => {
    if (riding || !(id in shownWhileRiding.value)) return
    const rest = { ...shownWhileRiding.value }
    delete rest[id]
    shownWhileRiding.value = rest
  })

  /** Forgets every player's settings, as a game is loaded or given up */
  function reset() {
    shownByPlayer.value = {}
    shownWhileRiding.value = {}
  }

  return {
    shownByPlayer,
    shownWhileRiding,
    showsOthersTrack,
    toggleOthersTrack,
    reset
  }
})
