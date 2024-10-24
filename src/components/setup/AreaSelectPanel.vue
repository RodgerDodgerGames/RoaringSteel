<template>
  <div class="bottom-panel">
    <h3>Selected State:</h3>
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
.bottom-panel {
  padding: 16px;
  text-align: center;
  background-color: #f8f8f8;
  border-top: 1px solid #ddd;
}
</style>
