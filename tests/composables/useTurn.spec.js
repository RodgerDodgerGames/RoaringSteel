/**
 * Turn Composable Tests
 *
 * Tests for ending a turn, including:
 * - Passing play to the next player, in the switchback order of the two
 *   opening building rounds and in order after that
 * - Advancing the game turn when a round ends
 * - Naming who is up next
 * - Auto-saving after each turn
 * - Clearing the finishing player's track building allowance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTurn } from '@/composables/useTurn'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'
import { useTrainsStore } from '@/stores/trains'
import { useDemandCardsStore } from '@/stores/demandCards'
import { gameRules } from '@/config/game'

// autoSave is stubbed so these tests exercise turn logic, not persistence
const { autoSave } = vi.hoisted(() => ({ autoSave: vi.fn(() => true) }))

vi.mock('@/composables/useGamePersistence', () => ({
  useGamePersistence: () => ({ autoSave })
}))

describe('useTurn', () => {
  let playerStore
  let gameStore

  beforeEach(() => {
    autoSave.mockClear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    playerStore = usePlayerStore()
    gameStore = useGameStore()
  })

  /** Adds n players and gives the first one the turn. */
  function seedPlayers(names = ['Alice', 'Bob', 'Charlie']) {
    const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange']
    names.forEach((name, i) => playerStore.addPlayer({ name, color: colors[i] }))
    playerStore.startGame()
  }

  describe('endTurn', () => {
    it('should pass play to the next player', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      expect(endTurn()).toBe(true)

      expect(playerStore.activePlayer.name).toBe('Bob')
    })

    it('should not advance the game turn mid-round', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      endTurn()

      expect(gameStore.turn).toBe(0)
    })

    it('should advance the game turn when the last player of the round ends their turn', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      endTurn() // Alice -> Bob
      endTurn() // Bob -> Charlie

      expect(gameStore.turn).toBe(0)

      endTurn() // Charlie -> Charlie, who opens the second building round

      expect(playerStore.activePlayer.name).toBe('Charlie')
      expect(gameStore.turn).toBe(1)
    })

    it('should advance the game turn once per full round', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      // Three full rounds of three players: both building rounds and the
      // first normal one
      for (let i = 0; i < 9; i++) {
        endTurn()
      }

      expect(gameStore.turn).toBe(3)
      expect(playerStore.activePlayer.name).toBe('Alice')
    })

    it('should advance the game turn on every end turn in a solo game', () => {
      seedPlayers(['Alice'])
      const { endTurn } = useTurn()

      endTurn()

      expect(playerStore.activePlayer.name).toBe('Alice')
      expect(gameStore.turn).toBe(1)
    })

    it('should give the first player the turn without advancing when nobody is active', () => {
      // Players exist but startGame was never called
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })
      const { endTurn } = useTurn()

      expect(endTurn()).toBe(true)

      expect(playerStore.activePlayer.name).toBe('Alice')
      expect(gameStore.turn).toBe(0)
    })

    it('should return false when there are no players', () => {
      const { endTurn } = useTurn()

      expect(endTurn()).toBe(false)
      expect(gameStore.turn).toBe(0)
    })

    it("should clear the finishing player's build allowance", () => {
      seedPlayers()
      playerStore.updatePlayer(1, { cash: 20000 })
      playerStore.spendOnTrack(1, 8000)
      const { endTurn } = useTurn()

      endTurn()

      // The allowance resets; the money spent does not come back
      expect(playerStore.players[0].trackSpentThisTurn).toBe(0)
      expect(playerStore.players[0].cash).toBe(12000)
    })

    it('should leave the incoming player their own allowance', () => {
      seedPlayers()
      playerStore.updatePlayer(2, { cash: 20000 })
      playerStore.updatePlayer(2, { trackSpentThisTurn: 3000 })
      const { endTurn } = useTurn()

      endTurn() // Alice -> Bob

      // Only the player who just finished is reset, so a counter carried in
      // from a save still limits the player it belongs to
      expect(playerStore.players[1].trackSpentThisTurn).toBe(3000)
    })

    it('should give a player a full allowance again on their next turn', () => {
      seedPlayers(['Alice', 'Bob'])
      playerStore.updatePlayer(1, { cash: 100000 })
      playerStore.spendOnTrack(1, gameRules.trackBudgetPerTurn)
      const { endTurn } = useTurn()

      endTurn() // Alice -> Bob
      endTurn() // Bob -> Bob, round two
      endTurn() // Bob -> Alice

      expect(playerStore.availableForTrack(1)).toBe(gameRules.trackBudgetPerTurn)
    })

    it('should auto-save once a round, as the round ends', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      endTurn() // Alice -> Bob
      endTurn() // Bob -> Charlie
      expect(autoSave).not.toHaveBeenCalled()

      endTurn() // Charlie -> Charlie, round two
      expect(autoSave).toHaveBeenCalledTimes(1)
      expect(gameStore.turn).toBe(1)
    })

    it('should not auto-save when the turn could not be ended', () => {
      const { endTurn } = useTurn()

      endTurn()

      expect(autoSave).not.toHaveBeenCalled()
    })
  })

  describe('the switchback start', () => {
    it('should play the building rounds out and back, then normal rounds in order', () => {
      seedPlayers()
      const { endTurn } = useTurn()
      const played = []

      // Who plays each turn, and in which round, across the first three rounds
      for (let i = 0; i < 9; i++) {
        played.push(`${gameStore.turn}:${playerStore.activePlayer.name}`)
        endTurn()
      }

      expect(played).toEqual([
        '0:Alice',
        '0:Bob',
        '0:Charlie',
        '1:Charlie',
        '1:Bob',
        '1:Alice',
        '2:Alice',
        '2:Bob',
        '2:Charlie'
      ])
    })

    it('should give a player who goes twice in a row a fresh allowance for the second turn', () => {
      seedPlayers()
      playerStore.updatePlayer(3, { cash: 100000 })
      playerStore.setActivePlayer(3)
      playerStore.spendOnTrack(3, gameRules.trackBudgetPerTurn)
      const { endTurn } = useTurn()

      endTurn() // Charlie -> Charlie, round two

      expect(playerStore.activePlayer.name).toBe('Charlie')
      expect(playerStore.availableForTrack(3)).toBe(gameRules.trackBudgetPerTurn)
    })
  })

  describe('nextPlayer', () => {
    it('should name nobody with no players', () => {
      const { nextPlayer } = useTurn()

      expect(nextPlayer.value).toBeUndefined()
    })

    it('should name the player endTurn then hands the turn to, every turn', () => {
      seedPlayers()
      const { nextPlayer, endTurn } = useTurn()

      // Through both building rounds and into normal play, where the order
      // changes direction twice and two players go twice in a row
      for (let i = 0; i < 9; i++) {
        const named = nextPlayer.value.name
        endTurn()
        expect(playerStore.activePlayer.name).toBe(named)
      }
    })
  })

  describe('playsAgain', () => {
    it('should be true only when the active player also plays the next turn', () => {
      seedPlayers()
      const { playsAgain, endTurn } = useTurn()
      const again = []

      for (let i = 0; i < 9; i++) {
        again.push(playsAgain.value)
        endTurn()
      }

      // Charlie at the end of round 1, Alice at the end of round 2
      expect(again).toEqual([false, false, true, false, false, true, false, false, false])
    })

    it('should be false with no players', () => {
      const { playsAgain } = useTurn()

      expect(playsAgain.value).toBe(false)
    })
  })

  describe('the end of the game', () => {
    // Two major cities joined by Alice's track, so she needs both
    const towns = [
      { name: 'Alpha', msa: 'A', lat: 0, lon: 0, size: 'large', industries: [] },
      { name: 'Beta', msa: 'B', lat: 0, lon: 0.3, size: 'large', industries: [] }
    ]

    beforeEach(() => {
      seedPlayers(['Alice', 'Bob'])
      useTownsStore().setTowns(towns)
      useTrackStore().addSegment({
        ownerId: 1,
        coordinates: [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.3 }
        ]
      })
    })

    it('should end the game, not the turn, when the player has won', () => {
      playerStore.updatePlayer(1, { cash: gameRules.victory.cash })
      const { endTurn } = useTurn()

      expect(endTurn()).toBe(true)

      expect(gameStore.winnerId).toBe(1)
      expect(playerStore.activePlayer.name).toBe('Alice')
      expect(autoSave).toHaveBeenCalled()
    })

    it('should pass the turn as usual short of the winning cash', () => {
      playerStore.updatePlayer(1, { cash: gameRules.victory.cash - 1 })
      const { endTurn } = useTurn()

      endTurn()

      expect(gameStore.isOver).toBe(false)
      expect(playerStore.activePlayer.name).toBe('Bob')
    })

    it('should refuse to end a turn once the game is over', () => {
      gameStore.declareWinner(2)
      const { endTurn } = useTurn()

      expect(endTurn()).toBe(false)
      expect(playerStore.activePlayer.name).toBe('Alice')
    })
  })

  describe("the train's turn", () => {
    it("should clear what the finishing player's train did this turn", () => {
      seedPlayers(['Alice', 'Bob'])
      useTownsStore().setTowns([
        { name: 'Alpha', msa: 'A', lat: 0, lon: 0, size: 'small', industries: [] }
      ])
      gameStore.setGameState({ turn: 2 })
      const trainsStore = useTrainsStore()
      trainsStore.placeTrain(1, 'A')
      const { endTurn } = useTurn()

      endTurn()

      expect(trainsStore.trainOf(1).hasActed).toBe(false)
    })
  })

  describe('discardHand', () => {
    const card = (id) => ({ id, demands: [] })

    beforeEach(() => {
      seedPlayers(['Alice', 'Bob'])
      useDemandCardsStore().setDeck({
        drawPile: [card(4), card(5), card(6)],
        hands: { 1: [card(1), card(2), card(3)] }
      })
    })

    it('should give the player a new hand and end their turn', () => {
      const { discardHand } = useTurn()

      expect(discardHand()).toBe(true)

      expect(
        useDemandCardsStore()
          .handOf(1)
          .map((c) => c.id)
      ).toEqual([4, 5, 6])
      expect(playerStore.activePlayer.name).toBe('Bob')
    })

    it('should be refused once the player has built this turn', () => {
      playerStore.updatePlayer(1, { cash: 5000 })
      playerStore.spendOnTrack(1, 1000)
      const { discardHand, canDiscardHand } = useTurn()

      expect(canDiscardHand.value).toBe(false)
      expect(discardHand()).toBe(false)
      expect(
        useDemandCardsStore()
          .handOf(1)
          .map((c) => c.id)
      ).toEqual([1, 2, 3])
    })

    it('should stay refused after the building is torn up and refunded', () => {
      playerStore.updatePlayer(1, { cash: 5000 })
      playerStore.spendOnTrack(1, 1000)
      playerStore.refundTrackSpend(1, 1000)
      const { canDiscardHand } = useTurn()

      expect(canDiscardHand.value).toBe(false)
    })

    it('should be refused once the player has used their train this turn', () => {
      useTownsStore().setTowns([
        { name: 'Alpha', msa: 'A', lat: 0, lon: 0, size: 'small', industries: [] }
      ])
      gameStore.setGameState({ turn: 2 })
      useTrainsStore().placeTrain(1, 'A')
      const { discardHand } = useTurn()

      expect(discardHand()).toBe(false)
    })
  })
})
