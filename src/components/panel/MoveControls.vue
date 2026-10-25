<!--
  MoveControls.vue

  The "move your train" half of a turn, as it appears in the player dock:

  - on the player's first running turn, placing the train in a town
  - running the train to a town, picked from a list (nearest first, with the
    distance and any fee for another player's track) or clicked on the map
  - in a town: picking up what it produces, delivering loads the player's
    demand cards want there, and dropping loads

  Kept plain on purpose for now: the rules and choices are all live, the look
  is a first pass. Everything here goes through useTrainControls and the
  trains store, which a computer player can use the same way.
-->

<script setup>
import { ref, watch } from 'vue'
import { useTrainControls } from '@/composables/useTrainControls'
import { formatCurrency } from '@/composables/utils'

const {
  train,
  town,
  kmLeft,
  trainType,
  moveBlock,
  loadBlock,
  destinations,
  pickups,
  deliveries,
  towns,
  notice,
  nameOf,
  place,
  move,
  pickUp,
  deliver,
  drop,
  isPicking,
  startPicking,
  stopPicking
} = useTrainControls()

/** The town picked in the list, to place the train in or run it to */
const chosenTownId = ref('')

// The list changes as the train moves, so a choice from before may be gone
watch(destinations, () => {
  chosenTownId.value = ''
})

/**
 * How a destination reads in the list: its name, how far, and what it costs.
 * @param {Object} destination - From the trains store's `destinations`
 * @returns {string} The option's text
 */
function destinationLabel({ town: destination, km, reachable, payTo, fee }) {
  const parts = [`${destination.name} — ${Math.round(km)} km`]
  if (!reachable) parts.push('(stops on the way)')
  if (fee) parts.push(`· ${formatCurrency(fee)} to ${payTo.map(nameOf).join(', ')}`)
  return parts.join(' ')
}
</script>

<template>
  <div class="move-controls">
    <!-- Not on the board yet: place it -->
    <template v-if="!train.position">
      <p class="move-controls__note">Place your train in any town to start running it.</p>
      <div class="field has-addons">
        <div class="control is-expanded">
          <div class="select is-small is-fullwidth">
            <select v-model="chosenTownId" aria-label="Town to place your train in">
              <option value="" disabled>Choose a town…</option>
              <option v-for="option in towns" :key="option.msa" :value="option.msa">
                {{ option.name }}
              </option>
            </select>
          </div>
        </div>
        <div class="control">
          <button
            class="button is-small is-primary"
            :disabled="!chosenTownId"
            @click="place(chosenTownId)"
          >
            Place
          </button>
        </div>
      </div>
    </template>

    <!-- On the board: where it is and how far it can still go -->
    <template v-else>
      <div class="move-controls__status">
        <span>{{ town ? `In ${town.name}` : 'Between towns' }}</span>
        <!-- Only while it can still go: once it is done, the note below says why -->
        <span v-if="!moveBlock">{{ Math.round(kmLeft) }} of {{ trainType.rangeKm }} km left</span>
      </div>

      <p v-if="moveBlock" class="move-controls__note">{{ moveBlock }}</p>
      <div v-else class="field has-addons">
        <div class="control is-expanded">
          <div class="select is-small is-fullwidth">
            <select v-model="chosenTownId" aria-label="Town to run your train to">
              <option value="" disabled>
                {{ destinations.length ? 'Run to…' : 'No track leads anywhere from here' }}
              </option>
              <option
                v-for="option in destinations"
                :key="option.town.msa"
                :value="option.town.msa"
              >
                {{ destinationLabel(option) }}
              </option>
            </select>
          </div>
        </div>
        <div class="control">
          <button
            class="button is-small is-primary"
            :disabled="!chosenTownId"
            @click="move(chosenTownId)"
          >
            Go
          </button>
        </div>
      </div>
    </template>

    <!-- Or click towns on the map instead of using the lists -->
    <button
      v-if="!moveBlock || !train.position"
      class="button is-small is-fullwidth"
      :class="{ 'is-warning': isPicking }"
      @click="isPicking ? stopPicking() : startPicking()"
    >
      <span class="icon"><i class="fas fa-location-dot" aria-hidden="true"></i></span>
      <span>{{ isPicking ? 'Stop choosing on the map' : 'Choose on the map' }}</span>
    </button>

    <!-- In a town: load and unload -->
    <template v-if="town && !loadBlock">
      <div v-if="deliveries.length" class="move-controls__group">
        <span class="move-controls__label">Deliver here</span>
        <div class="buttons are-small">
          <button
            v-for="option in deliveries"
            :key="`${option.cardId}-${option.line}`"
            class="button is-success"
            @click="deliver(option.cardId, option.line)"
          >
            {{ option.demand.industry }} for {{ formatCurrency(option.demand.payoff) }}
          </button>
        </div>
      </div>

      <div v-if="pickups.length" class="move-controls__group">
        <span class="move-controls__label">Pick up here</span>
        <div class="buttons are-small">
          <button
            v-for="option in pickups"
            :key="option.industry"
            class="button"
            :disabled="!option.hasRoom"
            :title="option.hasRoom ? '' : 'Your train is full'"
            @click="pickUp(option.industry)"
          >
            {{ option.industry }}
          </button>
        </div>
      </div>

      <div v-if="train.loads.length" class="move-controls__group">
        <span class="move-controls__label">Drop a load here (for nothing)</span>
        <div class="buttons are-small">
          <button
            v-for="(load, index) in train.loads"
            :key="`${load}-${index}`"
            class="button is-light"
            @click="drop(load)"
          >
            {{ load }}
          </button>
        </div>
      </div>
    </template>

    <p
      v-if="notice"
      class="notification p-2 mb-0"
      :class="notice.isError ? 'is-danger is-light' : 'is-info is-light'"
      role="status"
    >
      {{ notice.text }}
    </p>
  </div>
</template>

<style scoped>
.move-controls {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.move-controls .field {
  margin-bottom: 0;
}

.move-controls__note {
  font-size: 0.85rem;
  color: var(--bulma-text-weak);
}

.move-controls__status {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-variant-numeric: tabular-nums;
}

.move-controls__group .buttons {
  margin-top: 0.25rem;
  margin-bottom: 0;
}

.move-controls__label {
  font-size: 0.8rem;
  font-weight: 700;
}
</style>
