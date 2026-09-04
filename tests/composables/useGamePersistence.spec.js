/**
 * Game Persistence Tests
 *
 * Turn state is part of the saved game: whoever was mid-turn when the game
 * was saved must be the one to resume play on load. The active player is
 * carried by the `isTurn` flag on each player object rather than a separate
 * id field, so these tests guard that it survives the round trip.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useGamePersistence } from '@/composables/useGamePersistence'

describe('useGamePersistence', () => {
  let playerStore
  let gameStore
  let persistence

  beforeEach(() => {
    // Persistence logs save/restore progress; keep test output readable
    vi.spyOn(console, 'log').mockImplementation(() => {})
    localStorage.clear()
    playerStore = usePlayerStore()
    gameStore = useGameStore()
    persistence = useGamePersistence()

    gameStore.setRegion({ name: 'Test Region' })
    ;['Alice', 'Bob', 'Charlie'].forEach((name, i) =>
      playerStore.addPlayer({ name, color: ['red', 'blue', 'green'][i], cash: 20000 })
    )
    playerStore.startGame()
  })

  describe('turn state', () => {
    it('should record which player is active in the serialized state', () => {
      playerStore.nextTurn()

      const state = persistence.serializeGameState()

      expect(state.players.map((p) => [p.name, p.isTurn])).toEqual([
        ['Alice', false],
        ['Bob', true],
        ['Charlie', false]
      ])
    })

    it('should record the game turn number', () => {
      gameStore.advanceTurn()
      gameStore.advanceTurn()

      expect(persistence.serializeGameState().game.turn).toBe(2)
    })

    it('should restore the active player so the right player resumes play', () => {
      playerStore.nextTurn() // Bob is mid-turn when the game is saved
      persistence.autoSave()

      playerStore.reset()
      gameStore.reset()
      expect(playerStore.activePlayer).toBeUndefined()

      const [latest] = persistence.getAutoSaves()
      expect(persistence.loadAutoSave(latest.index)).toBe(true)

      expect(playerStore.activePlayer.name).toBe('Bob')
      expect(playerStore.players.filter((p) => p.isTurn)).toHaveLength(1)
    })

    it('should restore the turn number alongside the active player', () => {
      playerStore.nextTurn()
      playerStore.nextTurn()
      gameStore.advanceTurn()
      persistence.autoSave()

      playerStore.reset()
      gameStore.reset()

      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(gameStore.turn).toBe(1)
      expect(playerStore.activePlayer.name).toBe('Charlie')
    })

    it('should restore player cash so spending survives a reload', () => {
      playerStore.updatePlayer(1, { cash: 12500 })
      persistence.autoSave()

      playerStore.reset()
      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(playerStore.players[0].cash).toBe(12500)
    })
  })
})
