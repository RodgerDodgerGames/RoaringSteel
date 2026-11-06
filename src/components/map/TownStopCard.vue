<!--
  TownStopCard.vue

  A card floating over the foot of the map when the player's train has just
  been placed in a town, or run into one, and the town has something for it
  (see the train stop store):

  - the loads the player's demand cards want delivered here, each with what
    it pays;
  - what the town makes, to pick up, each saying where the player's cards
    want it and for how much;
  - how full the train is, and how the last action went.

  "Done" closes it; it also goes when the train leaves the town or the turn
  ends. (Not Esc, which already ends drawing track and choosing a town.) The same choices stay in the dock, and the town's
  commodity icons on the map can be clicked to load too.

  Renders nothing while there is no stop.
-->

<script setup>
import { storeToRefs } from 'pinia'
import { useTrainStopStore, wantedLabel } from '@/stores/trainStop'
import { commodityIconUrl } from '@/composables/map/commodityIcons'
import { formatCurrency } from '@/composables/utils'

const trainStopStore = useTrainStopStore()
const { stopTown, pickups, deliveries, cargo, notice } = storeToRefs(trainStopStore)
const { pickUp, deliver, closeStop } = trainStopStore
</script>

<template>
  <section v-if="stopTown" class="town-stop" :aria-label="`Stop in ${stopTown.name}`">
    <header class="town-stop__head">
      <strong class="town-stop__title">In {{ stopTown.name }}</strong>
      <span class="town-stop__cargo">
        Train: {{ cargo.loads.length }} of {{ cargo.capacity }} loads
      </span>
    </header>

    <div v-if="deliveries.length" class="town-stop__group">
      <span class="town-stop__label">Deliver</span>
      <div class="buttons are-small">
        <button
          v-for="option in deliveries"
          :key="`${option.cardId}-${option.line}`"
          type="button"
          class="button is-success"
          @click="deliver(option.cardId, option.line)"
        >
          <img class="town-stop__icon" :src="commodityIconUrl(option.code)" alt="" />
          <span>{{ option.demand.industry }} for {{ formatCurrency(option.demand.payoff) }}</span>
        </button>
      </div>
    </div>

    <div v-if="pickups.length" class="town-stop__group">
      <span class="town-stop__label">Pick up</span>
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
          <img class="town-stop__icon" :src="commodityIconUrl(option.code)" alt="" />
          <span>{{ option.industry }}</span>
          <span v-if="option.wantedIn.length" class="town-stop__wanted">
            {{ wantedLabel(option.wantedIn) }}
          </span>
        </button>
      </div>
    </div>

    <p
      v-if="notice"
      class="town-stop__notice"
      :class="{ 'has-text-danger': notice.isError }"
      role="status"
    >
      {{ notice.text }}
    </p>

    <div class="town-stop__foot">
      <button type="button" class="button is-small is-primary" @click="closeStop">Done</button>
    </div>
  </section>
</template>

<style scoped>
.town-stop {
  /* Over the foot of the map, centered, above Leaflet's panes and controls */
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: max-content;
  max-width: calc(100% - 2rem);
  padding: 0.75rem 1rem;
  border-radius: var(--bulma-radius-large);
  background: var(--bulma-scheme-main);
  color: var(--bulma-text);
  box-shadow: var(--bulma-shadow);
  font-size: 0.9rem;
}

.town-stop__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 1rem;
}

.town-stop__title {
  font-size: 1rem;
}

.town-stop__cargo {
  font-size: 0.8rem;
  color: var(--bulma-text-weak);
  font-variant-numeric: tabular-nums;
}

.town-stop__label {
  font-size: 0.8rem;
  font-weight: 700;
}

.town-stop__group .buttons {
  margin-top: 0.25rem;
  margin-bottom: 0;
}

.town-stop .button {
  gap: 0.35rem;
}

.town-stop__icon {
  width: 18px;
  height: 18px;
}

.town-stop__wanted {
  font-size: 0.75rem;
  opacity: 0.85;
}

.town-stop__notice {
  font-size: 0.85rem;
}

.town-stop__foot {
  display: flex;
  justify-content: flex-end;
}
</style>
