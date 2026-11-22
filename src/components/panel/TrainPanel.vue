<!--
  TrainPanel.vue

  The active player's train, and everything to do with its freight:

  - what kind of train it is, how far it runs in a turn, and where it is,
    with each town named in the board's town-name style
  - the train drawn as a train: a locomotive, then one boxcar per load it can
    carry. A loaded car is boxcar red with its commodity's icon and name; an
    empty car is a dashed outline.
  - while the train is in a town and may load (see the train stop store's
    `loadingTown`):
      - above each loaded car, its button: Deliver (one per demand card
        that pays for the load here), or Drop Load, which leaves the load in
        the town for nothing. It can be picked back up while the train is
        still there, so there is no confirmation. The buttons sit above the
        cars so the train stays on its rail.
      - under the train, what the town makes, to pick up into the next empty
        car, each saying where the player's cards want it and for how much
  - otherwise, why nothing can be loaded (for one, the train is between
    towns)
  - how the last load action went

  Moving the train is in the dock's "This turn" section (MoveControls); its
  messages stay there. The map's stop card offers the same loading on
  arrival in a town, and the town's commodity icons on the map can be
  clicked to load too. All three go through the train stop store, so they
  always agree.

  Every player begins with a Freight; upgrades are bought in the dock's
  "This turn" section (see UpgradeControls).
-->

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useTrainsStore } from '@/stores/trains'
import { useTrainStopStore, wantedLabel } from '@/stores/trainStop'
import { whereaboutsParts } from '@/composables/trainStatus'
import { commodityIconUrl } from '@/composables/map/commodityIcons'
import { formatCurrency, formatShortCurrency } from '@/composables/utils'

const playerStore = usePlayerStore()
const gameStore = useGameStore()
const trainsStore = useTrainsStore()
const trainStopStore = useTrainStopStore()
const { cars, pickups, loadingTown, notice } = storeToRefs(trainStopStore)
const { pickUp, deliver, drop } = trainStopStore

const playerId = computed(() => playerStore.activePlayer?.id)
const train = computed(() => trainsStore.trainOf(playerId.value))
const trainType = computed(() => trainsStore.trainTypeOf(playerId.value))

/**
 * Where the train is and where it is heading, in pieces, each plain words
 * or a town's name (see trainStatus.js)
 */
const whereabouts = computed(() =>
  whereaboutsParts({
    placed: Boolean(train.value.position),
    town: trainsStore.townOf(playerId.value),
    heading: trainsStore.headingOf(playerId.value),
    nearest: trainsStore.nearestTownOf(playerId.value),
    speedUnitKm: gameStore.boardScale.speedUnitKm
  })
)

/**
 * Why nothing can be loaded or unloaded now, or null. Only once the train
 * is on the board: before that, "This turn" says to place it.
 */
const loadBlock = computed(() =>
  train.value.position ? trainsStore.whyCannotLoad(playerId.value) : null
)
</script>

<template>
  <CollapsibleSection title="Train" storage-key="dock_train">
    <div class="train-panel">
      <div class="train-panel__type">
        <span class="has-text-weight-bold">{{ trainType.name }}</span>
        <span class="train-panel__stats">
          Speed {{ trainType.speed }} · {{ trainType.capacity }} loads
        </span>
      </div>
      <p class="train-panel__where">
        <template v-for="(part, index) in whereabouts" :key="index">
          <span v-if="part.isTown" class="town-name">{{ part.text }}</span>
          <template v-else>{{ part.text }}</template>
        </template>
      </p>

      <!-- The train: locomotive, then one car per load, every bottom lined
           up on the rail drawn under them -->
      <div class="train-panel__consist" role="list" aria-label="Loads carried">
        <svg class="train-panel__loco" viewBox="0 0 66 63" aria-hidden="true">
          <!-- A small steam locomotive facing left, the way the train runs:
               boiler with a smokestack and cowcatcher, and a cab with a window -->
          <path
            class="train-panel__loco-body"
            d="M10 24h4v-10h7v10h18v-14h-3v-4h24v4h-3v40H6l-6 5v-6l6-3V30a6 6 0 0 1 4-6z"
          />
          <rect class="train-panel__loco-window" x="44" y="15" width="10" height="9" rx="1" />
          <circle class="train-panel__wheel" cx="14" cy="55" r="6" />
          <circle class="train-panel__wheel" cx="30" cy="54" r="7" />
          <circle class="train-panel__wheel" cx="47" cy="54" r="7" />
        </svg>

        <div v-for="(car, index) in cars" :key="index" class="train-panel__column" role="listitem">
          <!-- In a town, a loaded car's button: Deliver, or Drop Load -->
          <div v-if="loadingTown && car.load" class="train-panel__car-actions">
            <button
              v-for="option in car.deliveries"
              :key="`${option.cardId}-${option.line}`"
              type="button"
              class="button is-small is-success is-fullwidth"
              :aria-label="`Deliver ${car.load} for ${formatCurrency(option.demand.payoff)}`"
              @click="deliver(option.cardId, option.line)"
            >
              Deliver {{ formatShortCurrency(option.demand.payoff) }}
            </button>
            <button
              v-if="!car.deliveries.length"
              type="button"
              class="button is-small is-fullwidth train-panel__drop"
              title="Leave this load in town, for nothing"
              :aria-label="`Drop Load: ${car.load}`"
              @click="drop(car.load)"
            >
              Drop Load
            </button>
          </div>

          <div
            class="train-panel__car"
            :class="{ 'is-empty': !car.load, 'is-deliverable': car.deliveries.length }"
            :title="car.load ?? 'Empty'"
          >
            <img
              v-if="car.load"
              class="train-panel__car-icon"
              :src="commodityIconUrl(car.code)"
              alt=""
            />
            <span class="train-panel__car-name">{{ car.load ?? 'empty' }}</span>
          </div>

          <div class="train-panel__trucks" aria-hidden="true">
            <span class="train-panel__truck"><i></i><i></i></span>
            <span class="train-panel__truck"><i></i><i></i></span>
          </div>
        </div>
      </div>
      <div class="train-panel__rail" aria-hidden="true"></div>

      <!-- In a town: what it makes, to pick up into the next empty car -->
      <div v-if="loadingTown && pickups.length" class="train-panel__pickups">
        <span class="train-panel__label">
          Pick up in <span class="town-name">{{ loadingTown.name }}</span>
        </span>
        <div class="buttons are-small">
          <button
            v-for="option in pickups"
            :key="option.industry"
            type="button"
            class="button"
            :class="{ 'is-link is-light': option.wantedIn.length }"
            :disabled="!option.hasRoom"
            :title="option.hasRoom ? '' : 'Your train is full'"
            @click="pickUp(option.industry)"
          >
            <img class="train-panel__pickup-icon" :src="commodityIconUrl(option.code)" alt="" />
            <span>{{ option.industry }}</span>
            <span v-if="option.wantedIn.length" class="train-panel__wanted">
              {{ wantedLabel(option.wantedIn) }}
            </span>
          </button>
        </div>
      </div>

      <!-- Not able to load: why -->
      <p v-else-if="!loadingTown && loadBlock" class="train-panel__note">{{ loadBlock }}</p>

      <!-- How the last load action went -->
      <p
        v-if="notice"
        class="notification p-2 mb-0 train-panel__notice"
        :class="notice.isError ? 'is-danger is-light' : 'is-info is-light'"
        role="status"
      >
        {{ notice.text }}
      </p>
    </div>
  </CollapsibleSection>
</template>

<style scoped>
.train-panel__type {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.train-panel__stats {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--bulma-text-weak);
}

.train-panel__where {
  margin: 0.15rem 0 0.75rem;
  font-size: 0.9rem;
}

/* Town names keep the board's lettering (see `.town-name` in map.css) but not
   its white-on-dark halo, which is made for the map and smudges on the paper
   panel: here they take the panel's own strong text color, in either mode.
   A touch smaller than the sentence around them, as on the board. */
.train-panel .town-name {
  font-size: 0.78rem;
  color: var(--bulma-text-strong);
  -webkit-text-stroke: 0;
  text-shadow: none;
}

/* THE TRAIN */

/* Locomotive and cars in a row. Bottoms line up, so the rail runs straight
   under every wheel however tall a car's buttons make its column. */
.train-panel__consist {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.train-panel__loco {
  flex: none;
  width: 60px;
  height: auto;
}

.train-panel__loco-body,
.train-panel__wheel {
  fill: var(--bulma-text);
}

.train-panel__loco-window {
  fill: var(--bulma-scheme-main);
}

/* One car and its buttons. Cars share the width; min-width 0 lets a long
   commodity name be cut short rather than push the train wider. */
.train-panel__column {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.train-panel__car-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

/* A narrow car's button wraps rather than spilling past the car */
.train-panel__car-actions .button {
  height: auto;
  white-space: normal;
  line-height: 1.2;
  padding-block: 0.3em;
}

.train-panel__drop {
  color: var(--bulma-text-weak);
}

/* A boxcar: red, with faint plank lines, a roof line above it and a
   coupler to the car in front */
.train-panel__car {
  position: relative;
  height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 2px solid var(--bulma-primary);
  border-radius: 3px;
  background:
    repeating-linear-gradient(90deg, transparent 0 9px, rgb(0 0 0 / 0.12) 9px 10px),
    var(--bulma-primary);
  color: var(--bulma-primary-invert);
}

.train-panel__car::before {
  content: '';
  position: absolute;
  top: -5px;
  left: -4px;
  right: -4px;
  height: 3px;
  border-radius: 2px;
  background: var(--bulma-primary);
}

.train-panel__car::after {
  content: '';
  position: absolute;
  left: -9px;
  bottom: 6px;
  width: 7px;
  height: 3px;
  background: var(--bulma-text);
}

/* A car whose load can be delivered here */
.train-panel__car.is-deliverable {
  box-shadow: 0 0 0 3px var(--bulma-success);
}

/* An empty car: just its outline */
.train-panel__car.is-empty {
  border-style: dashed;
  border-color: var(--bulma-text-weak);
  background: transparent;
  color: var(--bulma-text-weak);
}

.train-panel__car.is-empty::before {
  background: var(--bulma-text-weak);
  opacity: 0.5;
}

/* The commodity icons are white on a black square; `screen` drops the black,
   leaving a white icon on the red car */
.train-panel__car-icon {
  width: 22px;
  height: 22px;
  mix-blend-mode: screen;
}

.train-panel__car-name {
  max-width: 100%;
  padding: 0 4px;
  overflow: hidden;
  font-family: var(--font-label);
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.train-panel__car.is-empty .train-panel__car-name {
  font-family: inherit;
  font-style: italic;
  font-weight: 400;
}

/* Two pairs of wheels under each car */
.train-panel__trucks {
  display: flex;
  justify-content: space-between;
  padding: 1px 4px 0;
}

.train-panel__truck {
  display: flex;
  gap: 2px;
}

.train-panel__truck i {
  display: block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--bulma-text);
}

/* The rail, with its ties showing below it */
.train-panel__rail {
  height: 7px;
  margin-top: -1px;
  border-top: 3px solid var(--bulma-text-weak);
  background: repeating-linear-gradient(90deg, var(--bulma-border) 0 5px, transparent 5px 13px);
}

/* UNDER THE TRAIN */

.train-panel__pickups {
  margin-top: 0.75rem;
}

.train-panel__label {
  font-size: 0.8rem;
  font-weight: 700;
}

.train-panel__pickups .buttons {
  margin-top: 0.25rem;
  margin-bottom: 0;
}

.train-panel__pickups .button {
  gap: 0.35rem;
}

.train-panel__pickup-icon {
  width: 18px;
  height: 18px;
}

.train-panel__wanted {
  font-size: 0.75rem;
  opacity: 0.85;
}

.train-panel__note {
  margin-top: 0.6rem;
  font-size: 0.85rem;
  font-style: italic;
  color: var(--bulma-text-weak);
}

.train-panel__notice {
  margin-top: 0.75rem;
}
</style>
