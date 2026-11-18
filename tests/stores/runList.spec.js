/**
 * Run List Store Tests
 *
 * The dock's "Run to" list hides the places only other players' track leads
 * to until a player asks for them. Each player's setting stays as they left
 * it; while their train rides someone else's track, the places are shown
 * without being asked, unless they hide them for that ride.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { useRunListStore } from '@/stores/runList'
import { useTrainsStore } from '@/stores/trains'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'
import { pinSpeedUnit } from '../utils/boardScale'

// Towns along the equator, about 33 km apart
const town = (name, lng) => ({ name, msa: name, lat: 0, lon: lng, size: 'small', industries: [] })
const towns = [town('West', 0), town('Middle', 0.3), town('East', 0.6), town('Far', 0.9)]
const at = (name) => {
  const t = towns.find((candidate) => candidate.name === name)
  return { lat: t.lat, lng: t.lon }
}

const ANN = 1
const BO = 2

describe('run list store', () => {
  let store
  let trainsStore
  let playerStore
  let restoreScale

  /**
   * Puts Ann's train in a town, as if she had run it there, and lets the
   * store catch up with where it is
   */
  async function putAnnIn(townId) {
    trainsStore.setTrains({})
    trainsStore.placeTrain(ANN, townId)
    await nextTick()
  }

  beforeEach(async () => {
    restoreScale = pinSpeedUnit(10)
    localStorage.clear()
    store = useRunListStore()
    trainsStore = useTrainsStore()
    playerStore = usePlayerStore()

    useTownsStore().setTowns(towns)
    playerStore.addPlayer({ name: 'Ann', color: 'red', cash: 40000 })
    playerStore.addPlayer({ name: 'Bo', color: 'blue', cash: 40000 })
    playerStore.startGame()
    // Past the two building rounds, so trains run
    useGameStore().setGameState({ turn: 2 })
    // Ann's track runs West–Middle–East; Bo's runs East–Far, so Far is only
    // reached on Bo's track
    const trackStore = useTrackStore()
    trackStore.addSegment({ ownerId: ANN, coordinates: ['West', 'Middle', 'East'].map(at) })
    trackStore.addSegment({ ownerId: BO, coordinates: ['East', 'Far'].map(at) })
    await putAnnIn('West')
  })
  afterEach(() => restoreScale())

  it("should hide other players' track while the train is on its owner's own", () => {
    expect(playerStore.activePlayer.id).toBe(ANN)
    expect(store.showsOthersTrack).toBe(false)
  })

  it("should keep each player's setting as they left it, turn to turn", () => {
    store.toggleOthersTrack()
    expect(store.showsOthersTrack).toBe(true)

    playerStore.setActivePlayer(BO)
    expect(store.showsOthersTrack).toBe(false)

    playerStore.setActivePlayer(ANN)
    expect(store.showsOthersTrack).toBe(true)
  })

  it("should show other players' track without being asked while riding it", async () => {
    await putAnnIn('Far')

    expect(store.showsOthersTrack).toBe(true)
  })

  it('should let the player hide it for the ride, then go back to their own setting once home', async () => {
    store.toggleOthersTrack()
    await putAnnIn('Far')
    store.toggleOthersTrack()
    expect(store.showsOthersTrack).toBe(false)

    await putAnnIn('East')

    // Her own setting, shown, was left alone by hiding them for the ride
    expect(store.showsOthersTrack).toBe(true)
  })

  it('should start the next ride shown again, whatever was chosen for the last', async () => {
    await putAnnIn('Far')
    store.toggleOthersTrack()
    await putAnnIn('East')
    expect(store.showsOthersTrack).toBe(false)

    await putAnnIn('Far')

    expect(store.showsOthersTrack).toBe(true)
  })

  it("should forget every player's settings on reset", async () => {
    store.toggleOthersTrack()
    await putAnnIn('Far')
    store.toggleOthersTrack()

    store.reset()

    expect(store.shownByPlayer).toEqual({})
    expect(store.shownWhileRiding).toEqual({})
  })
})
