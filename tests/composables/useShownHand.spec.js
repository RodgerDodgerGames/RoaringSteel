/**
 * useShownHand Composable Tests
 *
 * The demand strip follows the player whose turn it is, and lets anyone peek
 * at another player's hand — hands are dealt face up in Empire Builder. A
 * peek must end when the turn passes or another game loads, so nobody starts
 * a turn reading someone else's cards as if they were their own.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { usePlayerStore } from '@/stores/players'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useShownHand } from '@/composables/useShownHand'

/**
 * A card with one placeholder contract; tests tell hands apart by card id.
 * @param {number} id - The card's id
 * @returns {Object} A demand card
 */
const card = (id) => ({ id, demands: [{ destination: 'Duluth', industry: 'Iron', payoff: 10 }] })

describe('useShownHand', () => {
  let playerStore
  let ids

  beforeEach(() => {
    playerStore = usePlayerStore()
    ;[
      ['Ann', 'red'],
      ['Bo', 'blue'],
      ['Cy', 'green']
    ].forEach(([name, color]) => playerStore.addPlayer({ name, color, cash: 0 }))
    playerStore.startGame()
    ids = playerStore.players.map((p) => p.id)

    // Each player holds one card, numbered to match their place in turn order
    useDemandCardsStore().setDeck({
      drawPile: [],
      hands: { [ids[0]]: [card(1)], [ids[1]]: [card(2)], [ids[2]]: [card(3)] }
    })
  })

  it('should show the active player their own hand', () => {
    const { shownPlayer, cards } = useShownHand()

    expect(shownPlayer.value.name).toBe('Ann')
    expect(cards.value.map((c) => c.id)).toEqual([1])
  })

  it("should show another player's hand when peeked at", () => {
    const { shownPlayer, cards, showHandOf } = useShownHand()

    showHandOf(ids[2])

    expect(shownPlayer.value.name).toBe('Cy')
    expect(cards.value.map((c) => c.id)).toEqual([3])
  })

  it('should go back to the new active player when the turn passes', async () => {
    const { shownPlayer, showHandOf } = useShownHand()
    showHandOf(ids[2])

    playerStore.setActivePlayer(ids[1])
    await nextTick()

    expect(shownPlayer.value.name).toBe('Bo')
  })

  it('should keep following the turn after the active player is picked', async () => {
    const { shownPlayer, showHandOf } = useShownHand()
    showHandOf(ids[0]) // Ann, whose turn it is

    playerStore.setActivePlayer(ids[1])
    await nextTick()

    // Not pinned to Ann: picking the active player means "follow the turn"
    expect(shownPlayer.value.name).toBe('Bo')
  })

  it('should end a peek when a different game is loaded', async () => {
    const { shownPlayer, showHandOf } = useShownHand()
    showHandOf(ids[2])

    // A loaded game replaces the players; its first player has the same id as
    // before, so the turn holder's id alone does not change
    playerStore.setPlayers(playerStore.players.map((p) => ({ ...p, name: `${p.name} II` })))
    await nextTick()

    expect(shownPlayer.value.name).toBe('Ann II')
  })
})
