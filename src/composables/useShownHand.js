/**
 * Shown Hand Composable (useShownHand.js)
 *
 * Decides whose demand cards the demand strip shows.
 *
 * In Empire Builder hands are dealt face up, so anyone may look at anyone's
 * cards. The strip follows the player whose turn it is, and a player can peek
 * at someone else's hand to see what they are chasing. The peek ends when the
 * turn passes, so nobody starts their turn looking at another player's cards.
 *
 * Only the active player's own hand is for planning from: its demand lines
 * can be pointed at and pinned to the map. A hand being peeked at is for
 * reading only.
 *
 * Which hand is on screen is display state, not game state: it is not saved.
 *
 * @module composables/useShownHand
 */

import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDemandCardsStore } from '@/stores/demandCards'
import { usePlayerStore } from '@/stores/players'

export function useShownHand() {
  const demandCardsStore = useDemandCardsStore()
  const { players, activePlayer } = storeToRefs(usePlayerStore())

  /** The player being peeked at, or null to follow whoever holds the turn */
  const peekedPlayerId = ref(null)

  /**
   * Whose hand is on screen: the peeked-at player, else the active one.
   * Looked up by id each time, so a peek at a player who is no longer in the
   * game falls back to the active player rather than to nobody.
   */
  const shownPlayer = computed(
    () => players.value.find((p) => p.id === peekedPlayerId.value) ?? activePlayer.value
  )

  /** True while the shown hand is the active player's own, which they can pin from */
  const isOwnHand = computed(
    () => Boolean(activePlayer.value) && shownPlayer.value?.id === activePlayer.value.id
  )

  /** The cards in the shown player's hand */
  const cards = computed(() =>
    shownPlayer.value ? demandCardsStore.handOf(shownPlayer.value.id) : []
  )

  /**
   * Ends any peek when the turn passes, or when a different game is loaded.
   * The second matters because player ids restart at 1 in every game: a
   * loaded game whose active player has the same id as before would not
   * count as a turn change, and the peek would land on a stranger's hand.
   * Loading replaces the players array, which is what the watch sees.
   */
  watch([() => activePlayer.value?.id, players], () => {
    peekedPlayerId.value = null
  })

  /**
   * Shows a player's hand. Picking the active player goes back to following
   * the turn, rather than pinning the strip to them.
   * @param {number} playerId - The player whose hand to show
   */
  function showHandOf(playerId) {
    peekedPlayerId.value = playerId === activePlayer.value?.id ? null : playerId
  }

  return { shownPlayer, cards, isOwnHand, showHandOf }
}
