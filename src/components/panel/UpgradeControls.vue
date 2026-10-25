<!--
  UpgradeControls.vue

  The "upgrade your train" choice for a turn's money, as it appears in the
  player dock: each kind of train the active player's train can become, what
  it costs out of the turn's allowance, and why it cannot be bought now if it
  cannot. The rules are the trains store's (see config/trains.js).
-->

<script setup>
import { ref, computed, watch } from 'vue'
import { usePlayerStore } from '@/stores/players'
import { useTrainsStore } from '@/stores/trains'
import { TRAIN_TYPES, trainRangeKm } from '@/config/trains'
import { formatCurrency } from '@/composables/utils'

const playerStore = usePlayerStore()
const trainsStore = useTrainsStore()

const playerId = computed(() => playerStore.activePlayer?.id)

/** The changes open to the active player's train */
const options = computed(() => trainsStore.changeOptions(playerId.value))

/** What the last change did, or why it could not be made */
const notice = ref(null)

// A new turn starts without the last player's report
watch(playerId, () => {
  notice.value = null
})

/**
 * Changes the train.
 * @param {Object} option - One of `options`
 */
function change(option) {
  const result = trainsStore.changeTrain(playerId.value, option.to)
  notice.value = result.ok
    ? { text: `Your train is now a ${option.name}.`, isError: false }
    : { text: result.error, isError: true }
}
</script>

<template>
  <div class="upgrade-controls">
    <p v-if="!options.length" class="upgrade-controls__note">
      Your train is a Superfreight: there is nothing faster or bigger.
    </p>
    <div v-for="option in options" :key="option.to" class="upgrade-controls__option">
      <div class="upgrade-controls__row">
        <span>
          <strong>{{ option.name }}</strong>
          <span class="upgrade-controls__note">
            {{ trainRangeKm(option.to) }} km · {{ TRAIN_TYPES[option.to].capacity }} loads
          </span>
        </span>
        <button
          class="button is-small is-primary"
          :disabled="Boolean(option.error)"
          @click="change(option)"
        >
          {{ formatCurrency(option.cost) }}
        </button>
      </div>
      <p v-if="option.error" class="upgrade-controls__note">{{ option.error }}</p>
    </div>
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
.upgrade-controls {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.upgrade-controls__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.upgrade-controls__note {
  margin-left: 0.4rem;
  font-size: 0.8rem;
  color: var(--bulma-text-weak);
}

p.upgrade-controls__note {
  margin-left: 0;
}
</style>
