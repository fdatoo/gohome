<!--
  ConditionEditor — single condition row. v1 supports state and numeric.
-->
<script setup lang="ts">
import { computed } from "vue";
import { SyText, SyButton, SyInput, SyIcon } from "@/lib";

export type ConditionKind = "state" | "numeric" | "unsupported";

export interface ConditionValue {
  kind: ConditionKind;
  /** state */
  entity?: string; equals?: string; not?: string;
  /** numeric */
  numericEntity?: string; op?: "<" | "<=" | "=" | ">=" | ">"; value?: number;
}

const props = defineProps<{ modelValue: ConditionValue }>();
const emit = defineEmits<{
  (e: "update:modelValue", v: ConditionValue): void;
  (e: "remove"): void;
}>();

const v = computed<ConditionValue>({
  get: () => props.modelValue,
  set: (next) => emit("update:modelValue", next),
});

function setKind(k: ConditionKind): void { v.value = { kind: k }; }
function update<K extends keyof ConditionValue>(key: K, val: ConditionValue[K]): void {
  v.value = { ...v.value, [key]: val };
}
</script>

<template>
  <div class="ce">
    <div class="ce__head">
      <select :value="v.kind" @change="setKind(($event.target as HTMLSelectElement).value as ConditionKind)">
        <option value="state">State</option>
        <option value="numeric">Numeric</option>
      </select>
      <SyButton intent="ghost" size="sm" @click="emit('remove')">
        <SyIcon name="close" :size="12" />
      </SyButton>
    </div>

    <template v-if="v.kind === 'state'">
      <SyInput :model-value="v.entity ?? ''" placeholder="entity id" @update:model-value="(s: string) => update('entity', s)" />
      <SyInput :model-value="v.equals ?? ''" placeholder="equals (optional)" @update:model-value="(s: string) => update('equals', s)" />
      <SyInput :model-value="v.not ?? ''" placeholder="not (optional)" @update:model-value="(s: string) => update('not', s)" />
    </template>

    <template v-else-if="v.kind === 'numeric'">
      <SyInput :model-value="v.numericEntity ?? ''" placeholder="entity id" @update:model-value="(s: string) => update('numericEntity', s)" />
      <select :value="v.op ?? '='" @change="update('op', ($event.target as HTMLSelectElement).value as ConditionValue['op'])">
        <option value="<">&lt;</option>
        <option value="<=">&le;</option>
        <option value="=">=</option>
        <option value=">=">&ge;</option>
        <option value=">">&gt;</option>
      </select>
      <SyInput
        :model-value="String(v.value ?? '')"
        placeholder="value"
        @update:model-value="(s: string) => update('value', s === '' ? undefined : Number(s))"
      />
    </template>

    <SyText v-else variant="caption" tone="subtle">Unsupported condition kind.</SyText>
  </div>
</template>

<style scoped>
.ce { display: flex; flex-direction: column; gap: var(--sy-space-2); padding: var(--sy-space-2); border: 1px solid var(--sy-color-line-soft); border-radius: var(--sy-radius-sm); }
.ce__head { display: flex; align-items: center; justify-content: space-between; }
.ce__head select { padding: 4px var(--sy-space-2); border: 1px solid var(--sy-color-line); border-radius: var(--sy-radius-sm); background: var(--sy-color-surface-2); color: var(--sy-color-fg); }
</style>
