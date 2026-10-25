/**
 * Trains Store Tests
 *
 * A player's turn with their train: placing it, running it along the track
 * (on their own track where they can, paying fees on anyone else's), picking
 * up, delivering and dropping loads, and changing the train for another
 * kind. Each action answers { ok, error }, and is refused outside the
 * player's own turn, in the building rounds, and once they have started
 * building.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useTrainsStore } from '@/stores/trains'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'
import { useDemandCardsStore } from '@/stores/demandCards'
import { gameRules } from '@/config/game'
import { trainRangeKm } from '@/config/trains'
import { kmBetween } from '@/composables/map/trackCost'

// Towns along the equator, 0.3 degrees of longitude (about 33 km) apart, so a
// Freight (90 km a turn) reaches two towns along but not three
const town = (name, lng, size, industries) => ({
  name,
  msa: name,
  lat: 0,
  lon: lng,
  size,
  industries: industries.map((industry) => ({ name: industry }))
})
const towns = [
  town('West', 0, 'large', ['Coal']),
  town('Middle', 0.3, 'small', ['Beef', 'Wine', 'Steel']),
  town('East', 0.6, 'large', ['Steel']),
  town('Far', 0.9, 'large', [])
]
const at = (name) => {
  const t = towns.find((candidate) => candidate.name === name)
  return { lat: t.lat, lng: t.lon }
}
const LEG_KM = kmBetween(at('West'), at('Middle'))

const ANN = 1
const BO = 2

describe('trains store', () => {
  let store
  let playerStore
  let gameStore
  let trackStore
  let demandCardsStore

  /** Lays a section of track for a player through the named towns */
  function lay(ownerId, ...names) {
    trackStore.addSegment({ ownerId, coordinates: names.map(at) })
  }

  /** A player's cash */
  const cashOf = (id) => playerStore.players.find((p) => p.id === id).cash

  beforeEach(() => {
    localStorage.clear()
    store = useTrainsStore()
    playerStore = usePlayerStore()
    gameStore = useGameStore()
    trackStore = useTrackStore()
    demandCardsStore = useDemandCardsStore()

    useTownsStore().setTowns(towns)
    playerStore.addPlayer({ name: 'Ann', color: 'red', cash: 40000 })
    playerStore.addPlayer({ name: 'Bo', color: 'blue', cash: 40000 })
    playerStore.startGame()
    // Past the two building rounds, so trains run
    gameStore.setGameState({ turn: 2 })
    // Ann's track runs West–Middle–East; Bo's runs East–Far
    lay(ANN, 'West', 'Middle', 'East')
    lay(BO, 'East', 'Far')
  })

  describe('a new train', () => {
    it('should be an empty Freight, not yet placed', () => {
      expect(store.trainOf(ANN)).toMatchObject({ type: 'freight', loads: [], position: null })
      expect(store.kmLeft(ANN)).toBe(trainRangeKm('freight'))
    })
  })

  describe('placeTrain', () => {
    it('should put the train in the town', () => {
      expect(store.placeTrain(ANN, 'West')).toEqual({ ok: true })

      expect(store.townOf(ANN).name).toBe('West')
    })

    it('should be allowed in a town no track reaches', () => {
      useTownsStore().setTowns([...towns, town('Nowhere', 5, 'small', [])])

      expect(store.placeTrain(ANN, 'Nowhere').ok).toBe(true)
    })

    it('should refuse a second placing', () => {
      store.placeTrain(ANN, 'West')

      expect(store.placeTrain(ANN, 'East').ok).toBe(false)
      expect(store.townOf(ANN).name).toBe('West')
    })

    it('should refuse in the building rounds', () => {
      gameStore.setGameState({ turn: 1 })

      expect(store.placeTrain(ANN, 'West')).toEqual({
        ok: false,
        error: "Trains don't run in the building rounds."
      })
    })

    it("should refuse on another player's turn", () => {
      expect(store.placeTrain(BO, 'West').ok).toBe(false)
    })

    it('should refuse once the game is over', () => {
      gameStore.declareWinner(BO)

      expect(store.placeTrain(ANN, 'West')).toEqual({ ok: false, error: 'The game is over.' })
    })

    it('should refuse an unknown town', () => {
      expect(store.placeTrain(ANN, 'Atlantis').ok).toBe(false)
    })
  })

  describe('moveTrain', () => {
    beforeEach(() => store.placeTrain(ANN, 'West'))

    it('should run the train along the track to the town', () => {
      const result = store.moveTrain(ANN, 'East')

      expect(result).toMatchObject({ ok: true, arrived: true, paid: [] })
      expect(result.km).toBeCloseTo(2 * LEG_KM)
      expect(store.townOf(ANN).name).toBe('East')
      expect(store.kmLeft(ANN)).toBeCloseTo(trainRangeKm('freight') - 2 * LEG_KM)
    })

    it('should stop part way when the town is beyond this turn', () => {
      const result = store.moveTrain(ANN, 'Far')

      expect(result).toMatchObject({ ok: true, arrived: false })
      expect(store.kmLeft(ANN)).toBe(0)
      expect(store.townOf(ANN)).toBeNull()
      // 90 km along: past East, on Bo's track toward Far
      expect(store.trainOf(ANN).position.lng).toBeGreaterThan(0.6)
    })

    it('should carry on from where it stopped next turn', () => {
      store.moveTrain(ANN, 'Far')
      store.endTurn(ANN)

      expect(store.moveTrain(ANN, 'Far')).toMatchObject({ ok: true, arrived: true })
    })

    it('should pay the owner a fee for running on their track, once a turn', () => {
      store.moveTrain(ANN, 'Far')

      expect(cashOf(ANN)).toBe(40000 - gameRules.trackUseFee)
      expect(cashOf(BO)).toBe(40000 + gameRules.trackUseFee)

      // Next turn, still on Bo's track: another fee
      store.endTurn(ANN)
      expect(store.moveTrain(ANN, 'Far').paid).toEqual([
        { ownerId: BO, amount: gameRules.trackUseFee }
      ])
    })

    it("should take the player's own track over a shorter way on someone else's", () => {
      // Bo's line East–Far is straight; Ann adds one of her own that bends
      // well south on the way
      trackStore.addSegment({
        ownerId: ANN,
        coordinates: [at('East'), { lat: -0.2, lng: 0.75 }, at('Far')]
      })
      store.moveTrain(ANN, 'East')
      store.endTurn(ANN)

      const result = store.moveTrain(ANN, 'Far')

      expect(result).toMatchObject({ ok: true, arrived: true, paid: [] })
      expect(result.km).toBeGreaterThan(1.5 * LEG_KM)
    })

    it('should not move a player who cannot pay the fees', () => {
      playerStore.updatePlayer(ANN, { cash: 100 })

      const result = store.moveTrain(ANN, 'Far')

      expect(result.ok).toBe(false)
      expect(store.townOf(ANN).name).toBe('West')
      expect(cashOf(BO)).toBe(40000)
    })

    it('should refuse a town no track leads to', () => {
      useTownsStore().setTowns([...towns, town('Nowhere', 5, 'small', [])])

      expect(store.moveTrain(ANN, 'Nowhere').ok).toBe(false)
    })

    it('should refuse the town the train is already in', () => {
      expect(store.moveTrain(ANN, 'West').ok).toBe(false)
    })

    it('should refuse a train not yet placed', () => {
      playerStore.setActivePlayer(BO)

      expect(store.moveTrain(BO, 'Far')).toEqual({
        ok: false,
        error: 'Place your train in a town first.'
      })
    })

    it('should refuse once the train has run its distance', () => {
      store.moveTrain(ANN, 'Far')

      expect(store.moveTrain(ANN, 'East').error).toBe(
        'Your train has run as far as it can this turn.'
      )
    })

    it('should refuse once the player has started building', () => {
      playerStore.spendOnTrack(ANN, 1000)

      expect(store.moveTrain(ANN, 'East').error).toBe(
        'Your train is done for this turn: you have started building.'
      )
    })
  })

  describe('destinations', () => {
    it('should list the towns the train can get to, nearest first', () => {
      store.placeTrain(ANN, 'West')

      const list = store.destinations(ANN)

      expect(list.map((d) => d.town.name)).toEqual(['Middle', 'East', 'Far'])
      expect(list.map((d) => d.reachable)).toEqual([true, true, false])
    })

    it("should name the fees for running on another player's track", () => {
      store.placeTrain(ANN, 'Middle')

      const far = store.destinations(ANN).find((d) => d.town.name === 'Far')

      expect(far).toMatchObject({ payTo: [BO], fee: gameRules.trackUseFee })
    })

    it('should be empty for a train not yet placed', () => {
      expect(store.destinations(ANN)).toEqual([])
    })
  })

  describe('pickUp', () => {
    beforeEach(() => store.placeTrain(ANN, 'Middle'))

    it("should load one of the town's commodities", () => {
      expect(store.pickUp(ANN, 'Beef')).toEqual({ ok: true })

      expect(store.trainOf(ANN).loads).toEqual(['Beef'])
    })

    it("should refuse a commodity the town doesn't produce", () => {
      expect(store.pickUp(ANN, 'Coal').ok).toBe(false)
    })

    it('should refuse when the train is full', () => {
      store.pickUp(ANN, 'Beef')
      store.pickUp(ANN, 'Wine')

      expect(store.pickUp(ANN, 'Steel')).toEqual({ ok: false, error: 'Your train is full.' })
      expect(store.pickupOptions(ANN).every((option) => !option.hasRoom)).toBe(true)
    })

    it('should refuse when the train is not in a town', () => {
      store.moveTrain(ANN, 'Far') // stops on the way

      expect(store.pickUp(ANN, 'Beef').ok).toBe(false)
    })

    it('should refuse once the player has started building', () => {
      playerStore.spendOnTrack(ANN, 1000)

      expect(store.pickUp(ANN, 'Beef').ok).toBe(false)
    })
  })

  describe('deliver', () => {
    const demandCard = {
      id: 7,
      demands: [
        { destination: 'East', industry: 'Beef', payoff: 9000 },
        { destination: 'West', industry: 'Wine', payoff: 5000 },
        { destination: 'Far', industry: 'Coal', payoff: 7000 }
      ]
    }

    beforeEach(() => {
      demandCardsStore.setDeck({
        drawPile: [{ id: 8, demands: [] }],
        hands: { [ANN]: [demandCard] }
      })
      store.placeTrain(ANN, 'Middle')
      store.pickUp(ANN, 'Beef')
      store.moveTrain(ANN, 'East')
    })

    it('should offer the demands the train can meet here', () => {
      expect(store.deliveryOptions(ANN)).toEqual([
        { cardId: 7, line: 0, demand: demandCard.demands[0] }
      ])
    })

    it('should pay the payoff, unload, and swap the card for a new one', () => {
      expect(store.deliver(ANN, 7, 0)).toEqual({ ok: true, payoff: 9000, won: false })

      expect(cashOf(ANN)).toBe(49000)
      expect(store.trainOf(ANN).loads).toEqual([])
      expect(demandCardsStore.handOf(ANN).map((c) => c.id)).toEqual([8])
    })

    it('should refuse a demand for somewhere else', () => {
      store.pickUp(ANN, 'Steel')

      expect(store.deliver(ANN, 7, 1).ok).toBe(false)
      expect(cashOf(ANN)).toBe(40000)
    })

    it('should end the game when the delivery makes the player the winner', () => {
      // Three major cities, so all three must be joined (6/7 of 3, rounded
      // up): Ann's own track joins Far to her West–East line
      lay(ANN, 'East', 'Far')
      playerStore.updatePlayer(ANN, { cash: gameRules.victory.cash - 9000 })

      expect(store.deliver(ANN, 7, 0).won).toBe(true)
      expect(gameStore.winnerId).toBe(ANN)
    })

    it('should not end the game with the cash but not the cities', () => {
      playerStore.updatePlayer(ANN, { cash: gameRules.victory.cash })

      expect(store.deliver(ANN, 7, 0).won).toBe(false)
      expect(gameStore.isOver).toBe(false)
    })
  })

  describe('dropLoad', () => {
    beforeEach(() => {
      store.placeTrain(ANN, 'Middle')
      store.pickUp(ANN, 'Beef')
    })

    it('should take the load off the train', () => {
      expect(store.dropLoad(ANN, 'Beef')).toEqual({ ok: true })

      expect(store.trainOf(ANN).loads).toEqual([])
    })

    it("should refuse a load the train isn't carrying", () => {
      expect(store.dropLoad(ANN, 'Coal').ok).toBe(false)
    })
  })

  describe('changeTrain', () => {
    it('should upgrade the train out of the turn allowance', () => {
      expect(store.changeTrain(ANN, 'fastFreight')).toEqual({ ok: true })

      expect(store.trainOf(ANN).type).toBe('fastFreight')
      expect(cashOf(ANN)).toBe(20000)
      expect(playerStore.trackBudgetRemaining(ANN)).toBe(0)
    })

    it('should end the train moving for the turn', () => {
      store.placeTrain(ANN, 'West')
      store.changeTrain(ANN, 'fastFreight')

      expect(store.moveTrain(ANN, 'East').ok).toBe(false)
    })

    it('should be allowed in the building rounds', () => {
      gameStore.setGameState({ turn: 0 })

      expect(store.changeTrain(ANN, 'heavyFreight').ok).toBe(true)
    })

    it('should refuse an upgrade once any of the allowance is spent', () => {
      playerStore.spendOnTrack(ANN, 1000)

      expect(store.changeTrain(ANN, 'fastFreight').ok).toBe(false)
      expect(store.trainOf(ANN).type).toBe('freight')
    })

    it('should leave the rest of the allowance after a crossgrade', () => {
      store.changeTrain(ANN, 'fastFreight')
      store.endTurn(ANN)
      playerStore.resetTrackSpend(ANN)

      store.changeTrain(ANN, 'heavyFreight')

      expect(playerStore.trackBudgetRemaining(ANN)).toBe(15000)
    })

    it('should refuse a change the train cannot make', () => {
      expect(store.changeTrain(ANN, 'superfreight').ok).toBe(false)
    })

    it('should refuse a smaller train than the loads carried need', () => {
      store.changeTrain(ANN, 'heavyFreight')
      playerStore.resetTrackSpend(ANN)
      store.placeTrain(ANN, 'Middle')
      store.pickUp(ANN, 'Beef')
      store.pickUp(ANN, 'Wine')
      store.pickUp(ANN, 'Steel')

      const fast = store.changeOptions(ANN).find((option) => option.to === 'fastFreight')

      expect(fast.error).toMatch(/carrying 3 loads/)
      expect(store.changeTrain(ANN, 'fastFreight').ok).toBe(false)
    })

    it('should run further after an upgrade to a faster train', () => {
      store.changeTrain(ANN, 'fastFreight')
      store.endTurn(ANN)

      expect(store.kmLeft(ANN)).toBe(trainRangeKm('fastFreight'))
    })
  })

  describe('endTurn', () => {
    it('should clear what the train did this turn', () => {
      store.placeTrain(ANN, 'Middle')
      store.moveTrain(ANN, 'Far')

      store.endTurn(ANN)

      expect(store.trainOf(ANN)).toMatchObject({ kmThisTurn: 0, feesPaidTo: [], hasActed: false })
    })
  })

  describe('setTrains and reset', () => {
    it('should restore trains from a save', () => {
      store.setTrains({ [ANN]: { ...store.trainOf(ANN), type: 'superfreight' } })

      expect(store.trainOf(ANN).type).toBe('superfreight')
    })

    it('should give every player a new train for a save without trains', () => {
      store.setTrains(undefined)

      expect(store.trainOf(ANN).type).toBe('freight')
    })

    it('should clear every train on reset', () => {
      store.changeTrain(ANN, 'fastFreight')

      store.reset()

      expect(store.trainOf(ANN).type).toBe('freight')
    })
  })
})
