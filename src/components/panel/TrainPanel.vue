<!--
  TrainPanel.vue

  The active player's train: what kind it is, how far it runs in a turn,
  where it is, and the loads it is carrying (one bay per load it can hold).

  Every player begins with a Freight; upgrades are bought in the dock's
  "This turn" section (see UpgradeControls).
-->

<script setup>
import { computed } from 'vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import { usePlayerStore } from '@/stores/players'
import { useTrainsStore } from '@/stores/trains'

const playerStore = usePlayerStore()
const trainsStore = useTrainsStore()

const playerId = computed(() => playerStore.activePlayer?.id)
const train = computed(() => trainsStore.trainOf(playerId.value))
const trainType = computed(() => trainsStore.trainTypeOf(playerId.value))

/** Where the train is, in words */
const whereabouts = computed(() => {
  if (!train.value.position) return 'Not on the board yet'
  const town = trainsStore.townOf(playerId.value)
  return town ? `In ${town.name}` : 'Between towns'
})

/** One entry per bay: the load in it, or null when it is empty */
const bays = computed(() =>
  Array.from({ length: trainType.value.capacity }, (_, i) => train.value.loads[i] ?? null)
)
</script>

<template>
  <CollapsibleSection title="Train" storage-key="dock_train">
    <div class="train-panel">
      <div class="train-panel__type">
        <span class="icon"><i class="fas fa-train" aria-hidden="true"></i></span>
        <span class="has-text-weight-bold">{{ trainType.name }}</span>
        <span class="train-panel__stats">
          {{ trainType.rangeKm }} km a turn · {{ trainType.capacity }} loads
        </span>
      </div>
      <p class="train-panel__where">{{ whereabouts }}</p>

      <div class="train-panel__loads" aria-label="Loads carried">
        <span
          v-for="(load, index) in bays"
          :key="index"
          class="train-panel__load"
          :class="{ 'is-full': load }"
          :title="load ?? ''"
        >
          {{ load ?? 'Empty' }}
        </span>
      </div>
    </div>
  </CollapsibleSection>
</template>

<style scoped>
.train-panel__type {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.train-panel__stats {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--bulma-text-weak);
}

.train-panel__where {
  margin-top: 0.25rem;
  font-size: 0.85rem;
}

.train-panel__loads {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.train-panel__load {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding: 0.35rem;
  border: 1px dashed var(--bulma-border);
  border-radius: var(--bulma-radius);
  font-size: 0.8rem;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--bulma-text-weak);
}

.train-panel__load.is-full {
  border-style: solid;
  color: var(--bulma-text-strong);
  font-weight: 700;
}
</style>
