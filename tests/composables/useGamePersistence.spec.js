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
import { useTrainsStore } from '@/stores/trains'
import { useTownsStore } from '@/stores/towns'
import { useGridStore } from '@/stores/grid'
import { useMapStore } from '@/stores/map'
import { BUILD_VIEW, PLAN_VIEW } from '@/composables/map/mapViews'
import { useGamePersistence } from '@/composables/useGamePersistence'
import { getGrid, putGrid } from '@/composables/database'
import { makeTestGrid, cellsOf } from '../utils/testGrid'

describe('useGamePersistence', () => {
  let playerStore
  let gameStore
  let trackStore
  let persistence

  /** A short line of track, for a game with something to lose */
  const A_LINE = [
    { lat: 44.98, lng: -93.27 },
    { lat: 44.94, lng: -93.09 }
  ]

  /** Loads the newest autosave */
  async function loadLatest() {
    const [latest] = await persistence.getAutoSaves()
    return persistence.loadAutoSave(latest.id)
  }

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

    it('should restore the active player so the right player resumes play', async () => {
      playerStore.setActivePlayer(2) // Bob is mid-turn when the game is saved
      await persistence.autoSave()

      playerStore.reset()
      gameStore.reset()
      expect(playerStore.activePlayer).toBeUndefined()

      expect(await loadLatest()).toBe(true)

      expect(playerStore.activePlayer.name).toBe('Bob')
      expect(playerStore.players.filter((p) => p.isTurn)).toHaveLength(1)
    })

    it('should restore the turn number alongside the active player', async () => {
      playerStore.setActivePlayer(3)
      gameStore.advanceTurn()
      await persistence.autoSave()

      playerStore.reset()
      gameStore.reset()

      await loadLatest()

      expect(gameStore.turn).toBe(1)
      expect(playerStore.activePlayer.name).toBe('Charlie')
    })

    // The second building round is played from the last player back to the
    // first, so restarting it with the first player would end it at once and
    // skip everyone else's second building turn
    it("should resume a save with no active player at the round's first player", async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      gameStore.advanceTurn() // the second building round
      const save = persistence.serializeGameState()
      save.players = save.players.map((p) => ({ ...p, isTurn: false }))

      await persistence.deserializeGameState(save)

      expect(playerStore.activePlayer.name).toBe('Charlie')
    })

    it('should warn but still load when the save records no active player', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const save = persistence.serializeGameState()
      // Simulate a save whose turn state was lost
      save.players = save.players.map((p) => ({ ...p, isTurn: false }))

      expect(persistence.validateSaveData(save).valid).toBe(true)
      expect(persistence.validateSaveData(save).warnings).toContain(
        'Expected 1 active player, found 0'
      )
      expect(await persistence.deserializeGameState(save)).toBe(true)

      // Repaired to the first player rather than left with nobody to play
      expect(playerStore.activePlayer.name).toBe('Alice')
      expect(warn).toHaveBeenCalled()
    })

    it('should repair a save with more than one active player', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const save = persistence.serializeGameState()
      save.players = save.players.map((p, i) => ({ ...p, isTurn: i !== 0 }))

      expect(persistence.validateSaveData(save).warnings).toContain(
        'Expected 1 active player, found 2'
      )
      await persistence.deserializeGameState(save)

      // Keeps the earliest player already flagged rather than resetting the round
      expect(playerStore.activePlayer.name).toBe('Bob')
      expect(playerStore.players.filter((p) => p.isTurn)).toHaveLength(1)
    })

    it('should not warn when turn state is consistent', () => {
      const validation = persistence.validateSaveData(persistence.serializeGameState())

      expect(validation.valid).toBe(true)
      expect(validation.warnings).toEqual([])
    })

    it('should restore player cash so spending survives a reload', async () => {
      playerStore.updatePlayer(1, { cash: 12500 })
      await persistence.autoSave()

      playerStore.reset()
      await loadLatest()

      expect(playerStore.players[0].cash).toBe(12500)
    })

    it('should restore how much of the build allowance is already used', async () => {
      // Without this a player reloads mid-turn with a fresh $20k to build with
      playerStore.spendOnTrack(1, 7500)
      await persistence.autoSave()

      playerStore.reset()
      await loadLatest()

      expect(playerStore.players[0].cash).toBe(12500)
      expect(playerStore.availableForTrack(1)).toBe(12500)
    })
  })

  describe('grid', () => {
    /** A 2x3 grid with one hole, and what it was built from */
    const grid = makeTestGrid({
      rows: 2,
      cols: 3,
      south: 39,
      west: -105,
      cell: (row, col) =>
        row === 1 && col === 2 ? null : { elevation: col * 100, cost: row + col }
    })
    const SOURCE = {
      state: '08',
      bounds: [-105, 39, -104, 40],
      cellSize: 10000,
      landCoverYear: 2023
    }

    /** Puts the grid in play, kept in the database as a new game's would be */
    async function playOnGrid() {
      await putGrid({ state: '08', cellSize: 10000, landCoverYear: 2023, grid })
      useGridStore().setGrid(grid, SOURCE)
    }

    it('should leave the grid out of an autosave, and record where it came from', async () => {
      await playOnGrid()
      await persistence.autoSave()

      const [latest] = await persistence.getAutoSaves()
      expect(latest.data.grid).toBeNull()
      expect(latest.data.terrain).toEqual(SOURCE)
    })

    it("should bring back an autosave's grid from the database", async () => {
      await playOnGrid()
      await persistence.autoSave()
      useGridStore().reset()

      expect(await loadLatest()).toBe(true)

      expect(cellsOf(useGridStore().grid)).toEqual(cellsOf(grid))
      expect(useGridStore().source).toEqual(SOURCE)
    })

    it('should build the grid again from the same year when the database has lost it', async () => {
      useGridStore().setGrid(grid, SOURCE) // never kept
      await persistence.autoSave()
      const gridForSave = vi.spyOn(useGridStore(), 'gridForSave').mockResolvedValue(grid)

      expect(await loadLatest()).toBe(true)

      expect(gridForSave).toHaveBeenCalledWith(SOURCE)
      expect(cellsOf(useGridStore().grid)).toEqual(cellsOf(grid))
    })

    it('should leave the game being played as it was when the grid cannot be built again', async () => {
      useGridStore().setGrid(grid, SOURCE)
      await persistence.autoSave()
      trackStore.addSegment({ ownerId: 1, coordinates: A_LINE, cost: 500, turn: 0 })
      vi.spyOn(useGridStore(), 'gridForSave').mockResolvedValue(false)

      expect(await loadLatest()).toBe(false)

      expect(trackStore.segments).toHaveLength(1)
      expect(useGridStore().grid).toBe(grid)
    })

    it('should carry the grid itself through a file', async () => {
      useGridStore().setGrid(grid, SOURCE) // not in the database: a file loads anywhere
      const file = JSON.parse(
        JSON.stringify(persistence.serializeGameState('file', { withGrid: true }))
      )
      useGridStore().reset()

      expect(await persistence.deserializeGameState(file)).toBe(true)

      expect(cellsOf(useGridStore().grid)).toEqual(cellsOf(grid))
    })

    it("should keep a file's grid, so the game's autosaves load without building it", async () => {
      useGridStore().setGrid(grid, SOURCE)
      const file = JSON.parse(
        JSON.stringify(persistence.serializeGameState('file', { withGrid: true }))
      )

      await persistence.deserializeGameState(file)

      const kept = await getGrid('08', 10000, 2023)
      expect(cellsOf(kept.grid)).toEqual(cellsOf(grid))
    })

    it('should refuse a file that does not hold its grid', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      useGridStore().setGrid(grid, SOURCE)
      const save = persistence.serializeGameState('file') // no grid, as an autosave
      const file = new File([JSON.stringify(save)], 'file.json')
      const gridForSave = vi.spyOn(useGridStore(), 'gridForSave')

      expect(await persistence.importFromFile(file)).toBe(false)
      expect(gridForSave).not.toHaveBeenCalled()
    })

    it('should refuse a file whose grid cannot be read', async () => {
      const save = persistence.serializeGameState()
      save.grid = [{ id: '0-0', centroid: { lat: 40, lng: -100 }, cost: 100 }]

      expect(persistence.validateSaveData(save).valid).toBe(false)
      expect(await persistence.deserializeGameState(save)).toBe(false)
    })

    it('should refuse a save that does not say where its grid came from', async () => {
      const save = persistence.serializeGameState()
      save.terrain = { state: '08', landCoverYear: 2023 } // no bounds or cell size

      expect(persistence.validateSaveData(save).valid).toBe(false)
    })
  })

  describe('saves from other versions', () => {
    it('should refuse a save from an older version of the game', async () => {
      const save = persistence.serializeGameState()
      save.version = '2.0.0'
      trackStore.addSegment({ ownerId: 1, coordinates: A_LINE, cost: 500, turn: 0 })

      expect(persistence.validateSaveData(save).errors).toContain(
        'Saved by another version of the game (2.0.0); only 3.0.0 saves load'
      )
      expect(await persistence.deserializeGameState(save)).toBe(false)
      // Nothing of the game being played was cleared
      expect(trackStore.segments).toHaveLength(1)
    })

    it('should refuse a save with no version', () => {
      const save = persistence.serializeGameState()
      delete save.version

      expect(persistence.validateSaveData(save).valid).toBe(false)
    })
  })

  describe('autosaves', () => {
    it('should keep only the newest three, newest first', async () => {
      for (let turn = 0; turn < 5; turn++) {
        if (turn > 0) gameStore.advanceTurn()
        await persistence.autoSave()
      }

      const saves = await persistence.getAutoSaves()

      expect(saves.map((save) => save.metadata.turn)).toEqual([4, 3, 2])
    })
  })

  describe('track', () => {
    const line = [
      { lat: 44.98, lng: -93.27 },
      { lat: 44.94, lng: -93.09 }
    ]

    it('should carry built track through a save and reload', async () => {
      trackStore.addSegment({ ownerId: 2, coordinates: line, cost: 3000, turn: 1 })
      await persistence.autoSave()

      trackStore.reset()
      playerStore.reset()
      gameStore.reset()

      expect(await loadLatest()).toBe(true)

      expect(trackStore.segments).toHaveLength(1)
      expect(trackStore.segments[0]).toMatchObject({ ownerId: 2, cost: 3000, turn: 1 })
      expect(trackStore.segments[0].coordinates).toEqual(line)
    })

    it('should keep track attributed to the player who built it', async () => {
      trackStore.addSegment({ ownerId: 1, coordinates: line, cost: 1000, turn: 0 })
      trackStore.addSegment({ ownerId: 3, coordinates: line, cost: 2000, turn: 0 })
      await persistence.autoSave()

      trackStore.reset()
      await loadLatest()

      expect(trackStore.segmentsForOwner(1).map((s) => s.cost)).toEqual([1000])
      expect(trackStore.segmentsForOwner(3).map((s) => s.cost)).toEqual([2000])
    })

    it('should not bring back a section the player tore up', async () => {
      const segment = trackStore.addSegment({ ownerId: 1, coordinates: line, cost: 500, turn: 0 })
      trackStore.removeSegment(segment.id)
      await persistence.autoSave()

      trackStore.reset()
      await loadLatest()

      expect(trackStore.segments).toEqual([])
    })

    it('should keep the edited shape of a reshaped section', async () => {
      const segment = trackStore.addSegment({ ownerId: 1, coordinates: line, cost: 500, turn: 0 })
      const reshaped = [
        { lat: 44.98, lng: -93.27 },
        { lat: 44.96, lng: -93.18 },
        { lat: 44.94, lng: -93.09 }
      ]
      trackStore.updateSegmentCoordinates(segment.id, reshaped)
      await persistence.autoSave()

      trackStore.reset()
      await loadLatest()

      expect(trackStore.segments[0].coordinates).toEqual(reshaped)
    })

    it('should clear track left over from the previous game on load', async () => {
      await persistence.autoSave() // a save taken before any track was built
      trackStore.addSegment({ ownerId: 1, coordinates: line, cost: 500, turn: 0 })

      await loadLatest()

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

    it('should carry every hand and the rest of the deck through a save and reload', async () => {
      demandCardsStore.setDeck({ drawPile: deckOf(12) })
      demandCardsStore.dealHands(playerIds())
      const handsBefore = playerIds().map(handIds)
      await persistence.autoSave()

      demandCardsStore.reset()
      expect(await loadLatest()).toBe(true)

      expect(playerIds().map(handIds)).toEqual(handsBefore)
      expect(demandCardsStore.drawPile.map((c) => c.id)).toEqual([10, 11, 12])
    })

    it("should carry the active player's pinned demand lines through a save and reload", async () => {
      demandCardsStore.setDeck({ drawPile: deckOf(12) })
      demandCardsStore.dealHands(playerIds())
      const [firstCard] = demandCardsStore.handOf(playerStore.activePlayer.id)
      demandCardsStore.togglePin(firstCard.id, 0)
      const pinsBefore = demandCardsStore.pinsOf(playerStore.activePlayer.id)
      await persistence.autoSave()

      demandCardsStore.reset()
      await loadLatest()

      expect(pinsBefore).toHaveLength(1)
      expect(demandCardsStore.pinsOf(playerStore.activePlayer.id)).toEqual(pinsBefore)
    })

    it('should load a short hand exactly as saved rather than dealing to it', async () => {
      const [firstId] = playerIds()
      demandCardsStore.setDeck({ drawPile: deckOf(5), hands: { [firstId]: deckOf(1) } })
      await persistence.autoSave()

      await loadLatest()

      expect(handIds(firstId)).toEqual([1])
      expect(demandCardsStore.drawPile).toHaveLength(5)
    })

    it('should still load a save whose deck is damaged, and say so', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const save = persistence.serializeGameState()
      save.demandDeck = { hands: {} } // no draw pile

      expect(await persistence.deserializeGameState(save)).toBe(true)

      expect(demandCardsStore.drawPile).toEqual([])
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('demand deck could not be read'))
    })

    it('should clear hands left over from the previous game on load', async () => {
      await persistence.autoSave() // a save taken before any cards were dealt
      demandCardsStore.setDeck({ drawPile: deckOf(9) })
      demandCardsStore.dealHands(playerIds())

      await loadLatest()

      playerIds().forEach((id) => expect(demandCardsStore.handOf(id)).toEqual([]))
    })
  })

  describe('trains and the end of the game', () => {
    /** Saves the game to a file's worth of JSON and loads it straight back */
    async function roundTrip() {
      const save = JSON.parse(JSON.stringify(persistence.serializeGameState()))
      expect(await persistence.deserializeGameState(save)).toBe(true)
    }

    it("should carry every player's train through a save and reload", async () => {
      const trainsStore = useTrainsStore()
      trainsStore.changeTrain(1, 'fastFreight')

      await roundTrip()

      expect(useTrainsStore().trainOf(1).type).toBe('fastFreight')
      expect(useTrainsStore().trainOf(2).type).toBe('freight')
    })

    it('should keep the winner of a game that is over', async () => {
      gameStore.declareWinner(2)

      await roundTrip()

      expect(gameStore.winnerId).toBe(2)
    })

    it('should keep the prices of a current save as they are', async () => {
      useTownsStore().setTowns([{ name: 'Denver', lat: 39.7, lon: -105, industries: [] }])
      useDemandCardsStore().setDeck({
        drawPile: [{ id: 1, demands: [{ destination: 'Denver', industry: 'Steel', payoff: 600 }] }]
      })

      await roundTrip()

      expect(useDemandCardsStore().drawPile[0].demands[0].payoff).toBe(600)
    })

    it('should keep the played demand cards', async () => {
      const demandCardsStore = useDemandCardsStore()
      demandCardsStore.setDeck({ drawPile: [], discardPile: [{ id: 9, demands: [] }] })

      await roundTrip()

      expect(demandCardsStore.discardPile.map((c) => c.id)).toEqual([9])
    })
  })

  describe('settings', () => {
    let settingsStore

    beforeEach(() => {
      settingsStore = useSettingsStore()
    })

    it('should bring back the settings the game was saved with', async () => {
      settingsStore.settings.showDeckCount = true
      await persistence.autoSave()

      settingsStore.settings.showDeckCount = false
      await loadLatest()

      expect(settingsStore.settings.showDeckCount).toBe(true)
    })
  })

  describe('starting a new game', () => {
    beforeEach(() => {
      gameStore.advanceTurn()
      useTownsStore().setTowns([{ name: 'Denver', industries: [] }])
      useGridStore().setGrid(makeTestGrid({ rows: 1, cols: 1, cell: () => ({ cost: 100 }) }))
      trackStore.addSegment({
        ownerId: 1,
        coordinates: [
          { lat: 39.7, lng: -105 },
          { lat: 39.8, lng: -104.9 }
        ],
        cost: 500
      })
      useDemandCardsStore().setDeck({ drawPile: [], hands: { 1: [] }, pins: {} })
      useMapStore().setViewMode(BUILD_VIEW)
    })

    it('should clear away everything from the game that was being played', () => {
      persistence.startNewGame()

      expect(gameStore.region).toBeNull()
      expect(gameStore.turn).toBe(0)
      expect(playerStore.players).toEqual([])
      expect(useTownsStore().towns).toEqual([])
      expect(useGridStore().grid).toBeNull()
      expect(trackStore.segments).toEqual([])
      expect(useDemandCardsStore().hands).toEqual({})
      expect(useMapStore().viewMode).toBe(PLAN_VIEW)
    })

    it("should keep the player's settings", () => {
      useSettingsStore().settings.showDeckCount = true

      persistence.startNewGame()

      expect(useSettingsStore().settings.showDeckCount).toBe(true)
    })

    it('should start the new setup with the same players, colors and order', () => {
      persistence.startNewGame()

      expect(playerStore.draftPlayers.map(({ name, color }) => ({ name, color }))).toEqual([
        { name: 'Alice', color: 'red' },
        { name: 'Bob', color: 'blue' },
        { name: 'Charlie', color: 'green' }
      ])
    })

    it('should keep a player whose color is already taken, with a free color', () => {
      // Only a damaged or hand-edited save could hold two players in one color
      playerStore.setPlayers([
        ...playerStore.players,
        { id: 4, name: 'Dana', color: 'RED', cash: 0, isTurn: false }
      ])

      persistence.startNewGame()

      const dana = playerStore.draftPlayers.find(({ name }) => name === 'Dana')
      expect(dana).toBeDefined()
      expect(dana.color.toLowerCase()).not.toBe('red')
    })

    it('should start the new setup with as many computer players as the game had', () => {
      playerStore.setPlayers([
        ...playerStore.players,
        { id: 4, name: 'Bot 1', color: 'purple', cash: 0, isTurn: false, isBot: true },
        { id: 5, name: 'Bot 2', color: 'orange', cash: 0, isTurn: false, isBot: true }
      ])

      persistence.startNewGame()

      // The people as rows to edit, the computer players as a count
      expect(playerStore.draftPlayers.map(({ name }) => name)).toEqual(['Alice', 'Bob', 'Charlie'])
      expect(playerStore.draftBotCount).toBe(2)
    })

    it('should start the new setup empty when the game had no players', () => {
      playerStore.reset()

      persistence.startNewGame()

      expect(playerStore.draftPlayers).toEqual([])
    })
  })
})
