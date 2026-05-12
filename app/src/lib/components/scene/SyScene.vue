<!--
  SyScene — chip that activates a scene on click. Pure presentational:
  emits `apply`, parent owns the busy/error state.
-->
<script setup lang="ts">
import SyText from "@/lib/components/text/SyText.vue";
import SyIcon from "@/lib/components/icon/SyIcon.vue";

defineProps<{
  name: string;
  busy?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "apply"): void;
}>();
</script>

<template>
  <button
    type="button"
    class="sy-scene"
    :class="{ 'sy-scene--busy': busy }"
    :disabled="disabled || busy"
    @click="emit('apply')"
  >
    <SyIcon name="sparkle" :size="14" />
    <SyText as="span" variant="body" weight="medium">{{ name }}</SyText>
  </button>
</template>

<style scoped>
.sy-scene {
  display: inline-flex; align-items: center; gap: var(--sy-space-2);
  padding: var(--sy-space-1) var(--sy-space-3);
  border: 1px solid var(--sy-color-line);
  border-radius: 999px;
  background: var(--sy-color-surface-2);
  color: var(--sy-color-fg);
  cursor: pointer;
  transition: background 120ms, border-color 120ms;
}
.sy-scene:hover:not(:disabled) {
  background: var(--sy-color-surface-3);
}
.sy-scene:disabled { cursor: default; opacity: 0.6; }
.sy-scene--busy { opacity: 0.7; }
</style>
