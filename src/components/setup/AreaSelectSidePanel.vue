<template>
  <div class="side-panel">
    <h3>Selected State</h3>
    <p v-if="state">{{ state }}</p>
    <p v-else>No state selected yet</p>
  </div>
</template>

<script setup>
// Props to receive the selected state
const props = defineProps({
  state: String
})
</script>

<style scoped>
.side-panel {
  padding: 16px;
  background-color: #f8f8f8;
  border-left: 1px solid #ddd;
  min-width: 200px;
}
</style>
