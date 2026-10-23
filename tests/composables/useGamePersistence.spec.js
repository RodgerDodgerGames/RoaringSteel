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
import { useTrackStore } from '@/stores/track'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useSettingsStore } from '@/stores/settings'
import { useGamePersistence } from '@/composables/useGamePersistence'

describe('useGamePersistence', () => {
  let playerStore
  let gameStore
  let trackStore
  let persistence

  beforeEach(() => {
    // Persistence logs save/restore progress; keep test output readable
    vi.spyOn(console, 'log').mockImplementation(() => {})
    localStorage.clear()
    playerStore = usePlayerStore()
    gameStore = useGameStore()
    trackStore = useTrackStore()
    persistence = useGamePersistence()

    gameStore.setRegion({ name: 'Test Region' })
    ;['Alice', 'Bob', 'Charlie'].forEach((name, i) =>
      playerStore.addPlayer({ name, color: ['red', 'blue', 'green'][i], cash: 20000 })
    )
    playerStore.startGame()
  })

  describe('turn state', () => {
    it('should record which player is active in the serialized state', () => {
      playerStore.setActivePlayer(2)

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
      playerStore.setActivePlayer(2) // Bob is mid-turn when the game is saved
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
      playerStore.setActivePlayer(3)
      gameStore.advanceTurn()
      persistence.autoSave()

      playerStore.reset()
      gameStore.reset()

      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(gameStore.turn).toBe(1)
      expect(playerStore.activePlayer.name).toBe('Charlie')
    })

    // The second building round is played from the last player back to the
    // first, so restarting it with the first player would end it at once and
    // skip everyone else's second building turn
    it("should resume a save with no active player at the round's first player", () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      gameStore.advanceTurn() // the second building round
      const save = persistence.serializeGameState()
      save.players = save.players.map((p) => ({ ...p, isTurn: false }))

      persistence.deserializeGameState(save)

      expect(playerStore.activePlayer.name).toBe('Charlie')
    })

    it('should warn but still load when the save records no active player', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const save = persistence.serializeGameState()
      // Simulate a save whose turn state was lost
      save.players = save.players.map((p) => ({ ...p, isTurn: false }))

      expect(persistence.validateSaveData(save).valid).toBe(true)
      expect(persistence.validateSaveData(save).warnings).toContain(
        'Expected 1 active player, found 0'
      )
      expect(persistence.deserializeGameState(save)).toBe(true)

      // Repaired to the first player rather than left with nobody to play
      expect(playerStore.activePlayer.name).toBe('Alice')
      expect(warn).toHaveBeenCalled()
    })

    it('should repair a save with more than one active player', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const save = persistence.serializeGameState()
      save.players = save.players.map((p, i) => ({ ...p, isTurn: i !== 0 }))

      expect(persistence.validateSaveData(save).warnings).toContain(
        'Expected 1 active player, found 2'
      )
      persistence.deserializeGameState(save)

      // Keeps the earliest player already flagged rather than resetting the round
      expect(playerStore.activePlayer.name).toBe('Bob')
      expect(playerStore.players.filter((p) => p.isTurn)).toHaveLength(1)
    })

    it('should not warn when turn state is consistent', () => {
      const validation = persistence.validateSaveData(persistence.serializeGameState())

      expect(validation.valid).toBe(true)
      expect(validation.warnings).toEqual([])
    })

    it('should restore player cash so spending survives a reload', () => {
      playerStore.updatePlayer(1, { cash: 12500 })
      persistence.autoSave()

      playerStore.reset()
      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(playerStore.players[0].cash).toBe(12500)
    })

    it('should restore how much of the build allowance is already used', () => {
      // Without this a player reloads mid-turn with a fresh $20k to build with
      playerStore.spendOnTrack(1, 7500)
      persistence.autoSave()

      playerStore.reset()
      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(playerStore.players[0].cash).toBe(12500)
      expect(playerStore.availableForTrack(1)).toBe(12500)
    })
  })

  describe('track', () => {
    const line = [
      { lat: 44.98, lng: -93.27 },
      { lat: 44.94, lng: -93.09 }
    ]

    it('should carry built track through a save and reload', () => {
      trackStore.addSegment({ ownerId: 2, coordinates: line, cost: 3000, turn: 1 })
      persistence.autoSave()

      trackStore.reset()
      playerStore.reset()
      gameStore.reset()

      const [latest] = persistence.getAutoSaves()
      expect(persistence.loadAutoSave(latest.index)).toBe(true)

      expect(trackStore.segments).toHaveLength(1)
      expect(trackStore.segments[0]).toMatchObject({ ownerId: 2, cost: 3000, turn: 1 })
      expect(trackStore.segments[0].coordinates).toEqual(line)
    })

    it('should keep track attributed to the player who built it', () => {
      trackStore.addSegment({ ownerId: 1, coordinates: line, cost: 1000, turn: 0 })
      trackStore.addSegment({ ownerId: 3, coordinates: line, cost: 2000, turn: 0 })
      persistence.autoSave()

      trackStore.reset()
      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(trackStore.segmentsForOwner(1).map((s) => s.cost)).toEqual([1000])
      expect(trackStore.segmentsForOwner(3).map((s) => s.cost)).toEqual([2000])
    })

    it('should load a save written before track was persisted', () => {
      const save = persistence.serializeGameState()
      delete save.track

      expect(persistence.deserializeGameState(save)).toBe(true)
      expect(trackStore.segments).toEqual([])
    })

    it('should not bring back a section the player tore up', () => {
      const segment = trackStore.addSegment({ ownerId: 1, coordinates: line, cost: 500, turn: 0 })
      trackStore.removeSegment(segment.id)
      persistence.autoSave()

      trackStore.reset()
      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(trackStore.segments).toEqual([])
    })

    it('should keep the edited shape of a reshaped section', () => {
      const segment = trackStore.addSegment({ ownerId: 1, coordinates: line, cost: 500, turn: 0 })
      const reshaped = [
        { lat: 44.98, lng: -93.27 },
        { lat: 44.96, lng: -93.18 },
        { lat: 44.94, lng: -93.09 }
      ]
      trackStore.updateSegmentCoordinates(segment.id, reshaped)
      persistence.autoSave()

      trackStore.reset()
      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(trackStore.segments[0].coordinates).toEqual(reshaped)
    })

    it('should clear track left over from the previous game on load', () => {
      persistence.autoSave() // a save taken before any track was built
      trackStore.addSegment({ ownerId: 1, coordinates: line, cost: 500, turn: 0 })

      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(trackStore.segments).toEqual([])
    })
  })

  describe('demand cards', () => {
    /**
     * A deck of cards numbered 1..count, each with one placeholder contract.
     * @param {number} count - How many cards
     * @returns {Array} The cards, top of the deck first
     */
    const deckOf = (count) =>
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        demands: [{ destination: 'Duluth', industry: 'Iron', payoff: 10 }]
      }))

    /** Ids of every player, in turn order */
    const playerIds = () => playerStore.players.map((p) => p.id)

    /** Ids of the cards a player holds */
    const handIds = (playerId) => demandCardsStore.handOf(playerId).map((c) => c.id)

    let demandCardsStore

    beforeEach(() => {
      demandCardsStore = useDemandCardsStore()
    })

    it('should carry every hand and the rest of the deck through a save and reload', () => {
      demandCardsStore.setDeck({ drawPile: deckOf(12) })
      demandCardsStore.dealHands(playerIds())
      const handsBefore = playerIds().map(handIds)
      persistence.autoSave()

      demandCardsStore.reset()
      const [latest] = persistence.getAutoSaves()
      expect(persistence.loadAutoSave(latest.index)).toBe(true)

      expect(playerIds().map(handIds)).toEqual(handsBefore)
      expect(demandCardsStore.drawPile.map((c) => c.id)).toEqual([10, 11, 12])
    })

    it("should carry the active player's pinned demand lines through a save and reload", () => {
      demandCardsStore.setDeck({ drawPile: deckOf(12) })
      demandCardsStore.dealHands(playerIds())
      const [firstCard] = demandCardsStore.handOf(playerStore.activePlayer.id)
      demandCardsStore.togglePin(firstCard.id, 0)
      const pinsBefore = demandCardsStore.pinsOf(playerStore.activePlayer.id)
      persistence.autoSave()

      demandCardsStore.reset()
      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(pinsBefore).toHaveLength(1)
      expect(demandCardsStore.pinsOf(playerStore.activePlayer.id)).toEqual(pinsBefore)
    })

    it('should deal hands when loading a save made before hands existed', () => {
      const save = persistence.serializeGameState()
      delete save.demandDeck
      // Old saves held the deck under `demandCards`, each card a bare list of
      // its contracts with no id
      save.demandCards = deckOf(12).map((c) => c.demands)

      expect(persistence.deserializeGameState(save)).toBe(true)

      playerIds().forEach((id) => expect(demandCardsStore.handOf(id)).toHaveLength(3))
      expect(demandCardsStore.drawPile).toHaveLength(3)
    })

    it('should load a short hand exactly as saved rather than dealing to it', () => {
      const [firstId] = playerIds()
      demandCardsStore.setDeck({ drawPile: deckOf(5), hands: { [firstId]: deckOf(1) } })
      persistence.autoSave()

      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(handIds(firstId)).toEqual([1])
      expect(demandCardsStore.drawPile).toHaveLength(5)
    })

    it('should still load a save whose deck is damaged, and say so', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const save = persistence.serializeGameState()
      save.demandDeck = { hands: {} } // no draw pile

      expect(persistence.deserializeGameState(save)).toBe(true)

      expect(demandCardsStore.drawPile).toEqual([])
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('demand deck could not be read'))
    })

    it('should clear hands left over from the previous game on load', () => {
      persistence.autoSave() // a save taken before any cards were dealt
      demandCardsStore.setDeck({ drawPile: deckOf(9) })
      demandCardsStore.dealHands(playerIds())

      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      playerIds().forEach((id) => expect(demandCardsStore.handOf(id)).toEqual([]))
    })
  })

  describe('settings', () => {
    let settingsStore

    beforeEach(() => {
      settingsStore = useSettingsStore()
    })

    it('should bring back the settings the game was saved with', () => {
      settingsStore.settings.showDeckCount = true
      persistence.autoSave()

      settingsStore.settings.showDeckCount = false
      const [latest] = persistence.getAutoSaves()
      persistence.loadAutoSave(latest.index)

      expect(settingsStore.settings.showDeckCount).toBe(true)
    })

    it("should leave the player's settings alone when the save has none", () => {
      const save = persistence.serializeGameState()
      delete save.settings // a save made before settings existed
      settingsStore.settings.showDeckCount = true

      expect(persistence.deserializeGameState(save)).toBe(true)

      expect(settingsStore.settings.showDeckCount).toBe(true)
    })
  })
})
