<!--
  BuildControls.vue

  The "build track" half of a turn, as it appears in the player dock:

  - what the player can still spend, and how much of this turn's building
    allowance is used
  - the button that starts or stops drawing a line on the map
  - what the line being drawn would cost, warning before it goes over budget
  - the sections built this turn, and a mode for tearing them back up

  These are only the controls. The drawing itself, and the track layers on the
  map, belong to the build-track instance the game view provides, because they
  have to outlive any panel — collapsing this section changes nothing on the
  map.
-->

<script setup>
import { inject, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { buildTrackKey } from '@/composables/map/useBuildTrack'
import { usePlayerStore } from '@/stores/players'
import { useTrackStore } from '@/stores/track'
import { useGameStore } from '@/stores/game'
import { gameRules } from '@/config/game'
import { formatCurrency } from '@/composables/utils'

// The game view's build-track instance; see the note at the top
const {
  pendingCost,
  availableToSpend,
  isOverBudget,
  buildError,
  isDrawingActive,
  isRemoving,
  startDrawingLine,
  toggleRemoveMode,
  cancelDrawing
} = inject(buildTrackKey)

const playerStore = usePlayerStore()
const trackStore = useTrackStore()
const { turn } = storeToRefs(useGameStore())

/**
 * What the active player has spent on track this turn. It is both how much of
 * the turn's allowance is used and the total of the sections listed below — a
 * section is charged as it is recorded and refunded as it is removed, so the
 * two never differ.
 */
const spentThisTurn = computed(() => playerStore.trackSpendThisTurn(playerStore.activePlayer?.id))

/**
 * The sections the active player has built so far this turn, in build order.
 * These are exactly the ones they may still tear up, so the Remove control
 * lives with this list.
 */
const sectionsThisTurn = computed(() =>
  trackStore.segmentsBuiltOn(playerStore.activePlayer?.id, turn.value)
)
</script>

<template>
  <div class="build-controls">
    <!-- What there is to spend. The headline figure is whichever of cash and
         allowance runs out first; the meter shows the allowance on its own. -->
    <div class="build-controls__budget">
      <div class="is-flex is-justify-content-space-between is-align-items-baseline">
        <span>Available to build</span>
        <span class="build-controls__available">{{ formatCurrency(availableToSpend) }}</span>
      </div>
      <progress
        class="progress is-small is-primary mt-2 mb-1"
        :value="spentThisTurn"
        :max="gameRules.trackBudgetPerTurn"
        :aria-label="`Building allowance used: ${formatCurrency(spentThisTurn)}`"
      ></progress>
      <p class="build-controls__note">
        {{ formatCurrency(spentThisTurn) }} of {{ formatCurrency(gameRules.trackBudgetPerTurn) }}
        turn allowance used
      </p>
    </div>

    <!-- Start / stop drawing -->
    <button
      v-if="!isDrawingActive"
      class="button is-primary is-fullwidth"
      :disabled="availableToSpend <= 0"
      @click="startDrawingLine"
    >
      <span class="icon"><i class="fas fa-pencil" aria-hidden="true"></i></span>
      <span>Start building</span>
    </button>
    <button v-else class="button is-danger is-light is-fullwidth" @click="cancelDrawing">
      <span class="icon"><i class="fas fa-xmark" aria-hidden="true"></i></span>
      <span>Stop building</span>
    </button>

    <!-- The line being drawn: its running cost, and whether it can be paid for -->
    <div v-if="isDrawingActive" class="build-controls__pending">
      <span>This line so far</span>
      <span class="has-text-weight-bold">{{ formatCurrency(pendingCost) }}</span>
    </div>

    <p v-if="isOverBudget" class="notification is-warning is-light p-2 mt-2 mb-0">
      This line costs {{ formatCurrency(pendingCost) }} — more than the
      {{ formatCurrency(availableToSpend) }} you have to spend. It cannot be built.
    </p>
    <p v-else-if="buildError" class="notification is-danger is-light p-2 mt-2 mb-0">
      {{ buildError }}
    </p>

    <!-- What has been built this turn, and the way to undo it -->
    <div v-if="sectionsThisTurn.length" class="build-controls__built">
      <div class="build-controls__built-header">
        <span class="has-text-weight-bold">Built this turn</span>
        <button
          class="button is-small"
          :class="{ 'is-warning': isRemoving }"
          @click="toggleRemoveMode"
        >
          {{ isRemoving ? 'Done removing' : 'Remove a section' }}
        </button>
      </div>
      <ol class="build-controls__sections">
        <li v-for="(section, index) in sectionsThisTurn" :key="section.id">
          <span>Section {{ index + 1 }}</span>
          <span>{{ formatCurrency(section.cost) }}</span>
        </li>
      </ol>
      <div class="build-controls__total">
        <span>Total</span>
        <span>{{ formatCurrency(spentThisTurn) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.build-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.build-controls__available {
  font-size: 1.25rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.build-controls__note {
  font-size: 0.8rem;
  color: var(--bulma-text-weak);
}

.build-controls__pending,
.build-controls__built-header,
.build-controls__sections li,
.build-controls__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.build-controls__built {
  padding-top: 0.75rem;
  border-top: 1px solid var(--bulma-border-weak);
}

.build-controls__sections {
  margin: 0.5rem 0;
  padding: 0;
  list-style: none;
  font-variant-numeric: tabular-nums;
}

.build-controls__total {
  padding-top: 0.4rem;
  border-top: 1px solid var(--bulma-border-weak);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
