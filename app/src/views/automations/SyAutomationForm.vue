<!--
  SyAutomationForm — modal that builds an AutomationConfig and writes
  the regenerated Pkl to automations/<id>.pkl via EditSessionService.
-->
<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { SySheet, SyText, SyButton, SyInput, SyIcon } from "@/lib";
import TriggerEditor, { type TriggerValue } from "./TriggerEditor.vue";
import ConditionEditor, { type ConditionValue } from "./ConditionEditor.vue";
import ActionEditor, { type ActionValue } from "./ActionEditor.vue";
import { regenPreview } from "@/data/regen-preview";
import { openForEdit, commitEdit } from "@/data/edit-session";

const props = defineProps<{
  open: boolean;
  /** When set, prefills the form for an existing automation. */
  initial?: {
    id: string;
    displayName?: string;
    triggers: TriggerValue[];
    conditions: ConditionValue[];
    actions: ActionValue[];
    areas: string[];
  };
}>();

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "saved", id: string): void;
}>();

const id = ref<string>("");
const displayName = ref<string>("");
const triggers = ref<TriggerValue[]>([]);
const conditions = ref<ConditionValue[]>([]);
const actions = ref<ActionValue[]>([]);
const areas = ref<string[]>([]);
const saveBusy = ref<boolean>(false);
const saveError = ref<string>("");

function reset(): void {
  if (props.initial) {
    id.value = props.initial.id;
    displayName.value = props.initial.displayName ?? "";
    triggers.value = props.initial.triggers;
    conditions.value = props.initial.conditions;
    actions.value = props.initial.actions;
    areas.value = props.initial.areas;
  } else {
    id.value = "";
    displayName.value = "";
    triggers.value = [];
    conditions.value = [];
    actions.value = [];
    areas.value = [];
  }
  saveError.value = "";
}

// Reset whenever the modal opens.
watch(() => props.open, (o) => { if (o) reset(); });

function close(): void { emit("update:open", false); }

function addTrigger(): void { triggers.value = [...triggers.value, { kind: "state_changed" }]; }
function addCondition(): void { conditions.value = [...conditions.value, { kind: "state" }]; }
function addAction(): void { actions.value = [...actions.value, { kind: "call_service" }]; }

function buildAst(): Record<string, unknown> {
  return {
    id: id.value,
    enabled: true,
    mode: "MODE_SINGLE",
    triggers: triggers.value.map(triggerToProto),
    conditions: conditions.value.map(conditionToProto),
    actions: actions.value.map(actionToProto),
    areas: areas.value,
  };
}

function triggerToProto(t: TriggerValue): Record<string, unknown> {
  switch (t.kind) {
    case "state_changed": {
      // Proto: StateChangeTrigger { entities (repeated), from, to, for_dur_ns }
      // UI shape uses a single `entity` + `holdSeconds`; convert here.
      const entities = t.entity ? [t.entity] : [];
      const forDurNs = (t.holdSeconds ?? 0) * 1_000_000_000;
      return { stateChange: { entities, from: t.from ?? "", to: t.to ?? "", forDurNs } };
    }
    case "time":
      return { time: { cron: t.cron ?? "" } };
    case "event":
      return { event: { kind: t.eventKind ?? "" } };
    case "webhook":
      return { webhook: { path: t.path ?? "" } };
  }
}

/** Map UI operators (<, <=, =, >=, >) to proto strings (lt/lte/eq/gte/gt). */
function numericOpToProto(op: ConditionValue["op"]): string {
  switch (op) {
    case "<":  return "lt";
    case "<=": return "lte";
    case ">=": return "gte";
    case ">":  return "gt";
    default:   return "eq";
  }
}

function conditionToProto(c: ConditionValue): Record<string, unknown> {
  switch (c.kind) {
    case "state":
      return { state: { entity: c.entity ?? "", equals: c.equals ?? "", not: c.not ?? "" } };
    case "numeric":
      return { numeric: { entity: c.numericEntity ?? "", op: numericOpToProto(c.op), value: c.value ?? 0 } };
    case "unsupported":
      return {};
  }
}

function actionToProto(a: ActionValue): Record<string, unknown> {
  if (a.kind === "call_service") {
    return { callService: { entity: a.entity ?? "", capability: a.capability ?? "", args: a.args ?? {} } };
  }
  return {};
}

async function save(): Promise<void> {
  if (!id.value) {
    saveError.value = "id is required";
    return;
  }
  saveBusy.value = true;
  saveError.value = "";
  try {
    const ast = buildAst();
    const { pklText } = await regenPreview({ fileType: "automation", astJson: JSON.stringify(ast) });

    const filePath = `automations/${id.value}.pkl`;
    const session = await openForEdit(filePath);
    const r = await commitEdit({
      filePath,
      lockToken: session.lockToken,
      regeneratedPkl: pklText,
      expectedFileHash: session.fileHash,
    });
    if (r.conflict) {
      saveError.value = `Conflict: ${r.conflict.reason}`;
      return;
    }
    emit("saved", id.value);
    close();
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saveBusy.value = false;
  }
}
</script>

<template>
  <SySheet :model-value="open" side="right" size="lg" title="Automation" @update:model-value="(v: boolean) => emit('update:open', v)">
    <div class="form">
      <section class="form__section">
        <SyText variant="label" tone="subtle">Identity</SyText>
        <SyInput :model-value="id" placeholder="id (e.g. morning-routine)" @update:model-value="(s: string) => id = s" />
        <SyInput :model-value="displayName" placeholder="displayName (optional)" @update:model-value="(s: string) => displayName = s" />
      </section>

      <section class="form__section">
        <div class="form__sectionHead">
          <SyText variant="label" tone="subtle">Triggers</SyText>
          <SyButton intent="ghost" size="sm" @click="addTrigger"><SyIcon name="plus" :size="12" /> Add</SyButton>
        </div>
        <TriggerEditor
          v-for="(t, i) in triggers" :key="i"
          :model-value="t"
          @update:model-value="(v: TriggerValue) => triggers[i] = v"
          @remove="triggers = triggers.filter((_, j) => j !== i)"
        />
      </section>

      <section class="form__section">
        <div class="form__sectionHead">
          <SyText variant="label" tone="subtle">Conditions</SyText>
          <SyButton intent="ghost" size="sm" @click="addCondition"><SyIcon name="plus" :size="12" /> Add</SyButton>
        </div>
        <ConditionEditor
          v-for="(c, i) in conditions" :key="i"
          :model-value="c"
          @update:model-value="(v: ConditionValue) => conditions[i] = v"
          @remove="conditions = conditions.filter((_, j) => j !== i)"
        />
      </section>

      <section class="form__section">
        <div class="form__sectionHead">
          <SyText variant="label" tone="subtle">Actions</SyText>
          <SyButton intent="ghost" size="sm" @click="addAction"><SyIcon name="plus" :size="12" /> Add</SyButton>
        </div>
        <ActionEditor
          v-for="(a, i) in actions" :key="i"
          :model-value="a"
          @update:model-value="(v: ActionValue) => actions[i] = v"
          @remove="actions = actions.filter((_, j) => j !== i)"
        />
      </section>

      <SyText v-if="saveError" variant="caption" tone="bad">{{ saveError }}</SyText>

      <footer class="form__foot">
        <SyButton intent="ghost" @click="close" :disabled="saveBusy">Cancel</SyButton>
        <SyButton intent="primary" :disabled="saveBusy || !id" @click="save">
          {{ saveBusy ? "Saving…" : "Save" }}
        </SyButton>
      </footer>
    </div>
  </SySheet>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--sy-space-4); padding: var(--sy-space-3); }
.form__section { display: flex; flex-direction: column; gap: var(--sy-space-2); }
.form__sectionHead { display: flex; align-items: center; justify-content: space-between; }
.form__foot { display: flex; gap: var(--sy-space-2); justify-content: flex-end; padding-top: var(--sy-space-3); border-top: 1px solid var(--sy-color-line-soft); }
</style>
