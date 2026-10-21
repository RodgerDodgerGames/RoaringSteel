<!--
  TrainPanel.vue

  The active player's train: what kind it is, how far it moves in a turn, and
  the loads it is carrying.

  PLACEHOLDER — trains are not in the game yet. This shows where the train
  will sit in the dock and roughly what it will hold, so the layout can be
  judged as a whole. It reads no game state. Replace its contents when trains
  are built.

  Every player begins Empire Builder with a Freight: 9 mileposts a turn,
  2 loads. That is what is pictured.
-->

<script setup>
import CollapsibleSection from '@/components/CollapsibleSection.vue'

// The two cargo slots a Freight has, drawn as empty bays
const LOAD_SLOTS = 2
</script>

<template>
  <CollapsibleSection title="Train" storage-key="dock_train" badge="Not built yet">
    <div class="train-panel">
      <div class="train-panel__type">
        <span class="icon"><i class="fas fa-train" aria-hidden="true"></i></span>
        <span class="has-text-weight-bold">Freight</span>
        <span class="train-panel__stats">9 mileposts · {{ LOAD_SLOTS }} loads</span>
      </div>

      <div class="train-panel__loads" aria-label="Loads carried">
        <span v-for="slot in LOAD_SLOTS" :key="slot" class="train-panel__load">Empty</span>
      </div>
    </div>
  </CollapsibleSection>
</template>

<style scoped>
/* Faded, to read as a preview rather than as live controls */
.train-panel {
  opacity: 0.55;
}

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

.train-panel__loads {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.train-panel__load {
  flex: 1;
  padding: 0.35rem;
  border: 1px dashed var(--bulma-border);
  border-radius: var(--bulma-radius);
  font-size: 0.8rem;
  text-align: center;
  color: var(--bulma-text-weak);
}
</style>
