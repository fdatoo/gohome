<!--
  ActionEditor — a single action row. v1 supports call_service;
  other kinds render read-only with a "not yet editable" notice.
-->
<script setup lang="ts">
import { computed } from "vue";
import { SyText, SyButton, SyInput, SyIcon } from "@/lib";

export type ActionKind = "call_service" | "unsupported";

export interface ActionValue {
  kind: ActionKind;
  /** call_service */
  entity?: string;
  capability?: string;
  args?: Record<string, string>;
  /** unsupported */
  rawJson?: string;
}

const props = defineProps<{ modelValue: ActionValue }>();
const emit = defineEmits<{
  (e: "update:modelValue", v: ActionValue): void;
  (e: "remove"): void;
}>();

const v = computed<ActionValue>({
  get: () => props.modelValue,
  set: (next) => emit("update:modelValue", next),
});

function update<K extends keyof ActionValue>(key: K, val: ActionValue[K]): void {
  v.value = { ...v.value, [key]: val };
}

const args = computed<Array<{ k: string; val: string }>>(() => {
  const m = v.value.args ?? {};
  return Object.keys(m).sort().map((k) => ({ k, val: m[k] }));
});

function setArg(k: string, val: string): void {
  v.value = { ...v.value, args: { ...(v.value.args ?? {}), [k]: val } };
}
function addArg(): void {
  v.value = { ...v.value, args: { ...(v.value.args ?? {}), "": "" } };
}
function removeArg(k: string): void {
  const next = { ...(v.value.args ?? {}) };
  delete next[k];
  v.value = { ...v.value, args: next };
}
function renameArgKey(oldKey: string, newKey: string): void {
  const next = { ...(v.value.args ?? {}) };
  const val = next[oldKey] ?? "";
  delete next[oldKey];
  next[newKey] = val;
  v.value = { ...v.value, args: next };
}
</script>

<template>
  <div class="ae">
    <div class="ae__head">
      <SyText variant="caption" weight="medium">{{ v.kind === "call_service" ? "Call service" : "Unsupported action kind" }}</SyText>
      <SyButton intent="ghost" size="sm" @click="emit('remove')">
        <SyIcon name="close" :size="12" />
      </SyButton>
    </div>

    <template v-if="v.kind === 'call_service'">
      <SyInput :model-value="v.entity ?? ''" placeholder="entity id" @update:model-value="(s: string) => update('entity', s)" />
      <SyInput :model-value="v.capability ?? ''" placeholder="capability (e.g. turn_on, set_brightness)" @update:model-value="(s: string) => update('capability', s)" />

      <div v-for="arg in args" :key="arg.k" class="ae__arg">
        <SyInput :model-value="arg.k" placeholder="arg name" @update:model-value="(s: string) => renameArgKey(arg.k, s)" />
        <SyInput :model-value="arg.val" placeholder="value" @update:model-value="(s: string) => setArg(arg.k, s)" />
        <SyButton intent="ghost" size="sm" @click="removeArg(arg.k)">
          <SyIcon name="close" :size="12" />
        </SyButton>
      </div>
      <SyButton intent="ghost" size="sm" @click="addArg">+ Add arg</SyButton>
    </template>

    <SyText v-else variant="caption" tone="subtle">
      This action kind isn't editable yet. It will be preserved as-is when you save.
    </SyText>
  </div>
</template>

<style scoped>
.ae { display: flex; flex-direction: column; gap: var(--sy-space-2); padding: var(--sy-space-2); border: 1px solid var(--sy-color-line-soft); border-radius: var(--sy-radius-sm); }
.ae__head { display: flex; align-items: center; justify-content: space-between; }
.ae__arg { display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--sy-space-2); }
</style>
