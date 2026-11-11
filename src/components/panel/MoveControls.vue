<!--
  MoveControls.vue

  The "move your train" half of a turn, as it appears in the player dock:

  - on the player's first running turn, placing the train in a town
  - running the train to a town, picked from a list (nearest first, with the
    distance, how many turns it takes, a dot for each other player whose
    track the way uses, and any fee for their track) or clicked on the map
  - carrying on toward a town a run of more than one turn is still heading
    for: it is chosen in the list already, with Confirm in place of Go
  - in a town: picking up what it produces, delivering loads the player's
    demand cards want there, and dropping loads

  Kept plain on purpose for now: the rules and choices are all live, the look
  is a first pass. Everything here goes through useTrainControls and the
  trains store, which a computer player can use the same way.

  @prop collapsed - Show only where the train is and how far it can still go.
                    The dock folds the step this way once the turn has moved
                    on to building; the player can unfold it again.
-->

<script setup>
import { ref, computed, watch } from 'vue'
import DestinationSelect from './DestinationSelect.vue'
import { useTrainControls } from '@/composables/useTrainControls'
import { turnsText } from '@/composables/trainStatus'
import { formatCurrency } from '@/composables/utils'

const {
  train,
  town,
  distanceLeft,
  distance,
  trainType,
  moveBlock,
  loadBlock,
  destinations,
  heading,
  status,
  pickups,
  deliveries,
  towns,
  notice,
  nameOf,
  colorOf,
  place,
  move,
  pickUp,
  deliver,
  drop,
  isPicking,
  startPicking,
  stopPicking
} = useTrainControls()

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false
  }
})

// Folded away, the step has no Stop button showing, so choosing towns on the
// map stops with it rather than going on unseen
watch(
  () => props.collapsed,
  (collapsed) => {
    if (collapsed) stopPicking()
  }
)

/** The town picked in the list, to place the train in or run it to */
const chosenTownId = ref('')

/** The town the train is still heading for, if track leads there, or null */
const headingTownId = computed(() => (heading.value?.route ? heading.value.town.msa : null))

/**
 * What the list starts on: the town the train is heading for, so carrying on
 * is one Confirm, or nothing.
 * @param {Array<Object>} list - The destinations
 * @returns {string} The town's id, or ''
 */
function startingChoice(list) {
  return list.some((option) => option.town.msa === headingTownId.value) ? headingTownId.value : ''
}

// The list is worked out again whenever anything it depends on changes. A
// choice still in it stays; one the train has run to (or past) is gone.
watch(destinations, (list) => {
  if (!list.some((option) => option.town.msa === chosenTownId.value)) {
    chosenTownId.value = startingChoice(list)
  }
})

// Another player's train, or the same one as a new turn starts: start over
// from its heading. Run first, so the list is filled before the first turn.
watch(
  [train, () => train.value.kmThisTurn === 0],
  () => {
    chosenTownId.value = startingChoice(destinations.value)
  },
  { immediate: true }
)

/** Whether the town chosen is the one the train is already heading for */
const isCarryingOn = computed(
  () => Boolean(chosenTownId.value) && chosenTownId.value === headingTownId.value
)

/**
 * How a destination reads in the list: its name, how far, how many turns it
 * takes, and what this turn's part of the way costs.
 * @param {Object} destination - From the trains store's `destinations`
 * @returns {string} The option's text, e.g. "Denver — 14 (2 turns) · $4M to Ann"
 */
function destinationLabel(destination) {
  const { town: place, km, payTo, fee } = destination
  const label = `${place.name} — ${distance(km)} (${turnsText(destination)})`
  return fee ? `${label} · ${feeText(fee, payTo)}` : label
}

/**
 * A fee and whom it goes to.
 * @param {number} fee - The total
 * @param {Array<number>} payTo - The players paid
 * @returns {string} e.g. "$4M to Ann"
 */
function feeText(fee, payTo) {
  return `${formatCurrency(fee)} to ${payTo.map(nameOf).join(', ')}`
}

/** The towns as the dropdown shows them, with a dot per other track owner */
const destinationOptions = computed(() =>
  destinations.value.map((destination) => ({
    id: destination.town.msa,
    label: destinationLabel(destination),
    owners: destination.owners.map((id) => ({ id, name: nameOf(id), color: colorOf(id) }))
  }))
)

/**
 * What the run button says: Go for a new run, Confirm for carrying on toward
 * the town the train is heading for, with what this turn of it costs.
 */
const runButtonText = computed(() => {
  if (!isCarryingOn.value) return 'Go'
  const { fee, payTo } = heading.value.route
  return fee ? `Confirm · ${feeText(fee, payTo)}` : 'Confirm'
})
</script>

<template>
  <div class="move-controls">
    <!-- Where the train is and how far it can still go: on the board, and
         all there is once the step is folded -->
    <div v-if="train.position || collapsed" class="move-controls__status">
      <span>{{ status }}</span>
      <!-- Only while it can still go: once it is done, the note below says why -->
      <span v-if="!moveBlock" class="move-controls__left"
        >Distance left: {{ distanceLeft }} of {{ trainType.speed }}</span
      >
    </div>

    <template v-if="!collapsed">
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

      <!-- On the board: run it somewhere -->
      <template v-else>
        <p v-if="moveBlock" class="move-controls__note">{{ moveBlock }}</p>
        <template v-else>
          <DestinationSelect
            v-model="chosenTownId"
            :options="destinationOptions"
            :placeholder="destinations.length ? 'Run to…' : 'No track leads anywhere from here'"
            aria-label="Town to run your train to"
          />
          <button
            class="button is-primary is-fullwidth"
            :disabled="!chosenTownId"
            @click="move(chosenTownId)"
          >
            {{ runButtonText }}
          </button>
        </template>
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
    </template>
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
  flex-wrap: wrap;
  gap: 0 0.5rem;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
}

.move-controls__left {
  flex: none;
  white-space: nowrap;
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
