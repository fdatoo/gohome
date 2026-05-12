<!--
  SyAreaForm — modal that builds an AreaConfig and writes the
  regenerated Pkl to areas/<id>.pkl via EditSessionService.
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import { SySheet, SyText, SyButton, SyInput } from "@/lib";
import { regenPreview } from "@/data/regen-preview";
import { openForEdit, commitEdit } from "@/data/edit-session";

const props = defineProps<{
  open: boolean;
  initial?: { id: string; displayName?: string; parentId?: string };
}>();

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "saved", id: string): void;
}>();

const id = ref<string>("");
const displayName = ref<string>("");
const parentId = ref<string>("");
const saveBusy = ref<boolean>(false);
const saveError = ref<string>("");

function reset(): void {
  if (props.initial) {
    id.value = props.initial.id;
    displayName.value = props.initial.displayName ?? "";
    parentId.value = props.initial.parentId ?? "";
  } else {
    id.value = "";
    displayName.value = "";
    parentId.value = "";
  }
  saveError.value = "";
}

watch(() => props.open, (o) => { if (o) reset(); });

function close(): void { emit("update:open", false); }

function buildAst(): Record<string, unknown> {
  const ast: Record<string, unknown> = {
    id: id.value,
    displayName: displayName.value,
  };
  if (parentId.value) ast.parentId = parentId.value;
  return ast;
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
    const { pklText } = await regenPreview({ fileType: "area", astJson: JSON.stringify(ast) });
    const filePath = `areas/${id.value}.pkl`;
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
  <SySheet :model-value="open" side="right" size="md" title="Room" @update:model-value="(v: boolean) => emit('update:open', v)">
    <div class="form">
      <SyInput :model-value="id" placeholder="id (e.g. kitchen)" @update:model-value="(s: string) => id = s" />
      <SyInput :model-value="displayName" placeholder="displayName (e.g. Kitchen)" @update:model-value="(s: string) => displayName = s" />
      <SyInput :model-value="parentId" placeholder="parentId (optional)" @update:model-value="(s: string) => parentId = s" />

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
.form { display: flex; flex-direction: column; gap: var(--sy-space-3); padding: var(--sy-space-3); }
.form__foot { display: flex; gap: var(--sy-space-2); justify-content: flex-end; padding-top: var(--sy-space-3); border-top: 1px solid var(--sy-color-line-soft); }
</style>
