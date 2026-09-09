/**
 * Turn Composable Tests
 *
 * Tests for ending a turn, including:
 * - Passing play to the next player
 * - Advancing the game turn only on wrap-around
 * - Auto-saving after each turn
 * - Clearing the finishing player's track building allowance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTurn } from '@/composables/useTurn'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
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

    it('should advance the game turn when the last player ends their turn', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      endTurn() // Alice -> Bob
      endTurn() // Bob -> Charlie

      expect(gameStore.turn).toBe(0)

      endTurn() // Charlie -> Alice, round complete

      expect(playerStore.activePlayer.name).toBe('Alice')
      expect(gameStore.turn).toBe(1)
    })

    it('should advance the game turn once per full round', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      // Three full rounds of three players
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
      endTurn() // Bob -> Alice

      expect(playerStore.availableForTrack(1)).toBe(gameRules.trackBudgetPerTurn)
    })

    it('should auto-save after each turn', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      endTurn()
      endTurn()

      expect(autoSave).toHaveBeenCalledTimes(2)
    })

    it('should not auto-save when the turn could not be ended', () => {
      const { endTurn } = useTurn()

      endTurn()

      expect(autoSave).not.toHaveBeenCalled()
    })
  })
})
