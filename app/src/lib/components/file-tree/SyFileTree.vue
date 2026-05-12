<!--
  SyFileTree — flat-or-one-level file list. Two-level only in v1:
  root files and files in one optional subdirectory (`handlers/`).

  Props:
    entries: FileEntry[]    — flat list with optional `subdir` path
    selectedPath?: string

  Emits:
    select(path: string)
-->
<script setup lang="ts">
import { computed } from "vue";
import SyText from "@/lib/components/text/SyText.vue";
import SyIcon from "@/lib/components/icon/SyIcon.vue";

export interface FileEntry {
  /** Path relative to the config root, e.g. "main.pkl" or "handlers/ride.star". */
  path: string;
  /** Display name (basename). */
  name: string;
  /** "pkl" | "star" — used for the icon. */
  kind: "pkl" | "star";
}

const props = defineProps<{
  entries: FileEntry[];
  selectedPath?: string;
}>();

const emit = defineEmits<{
  (e: "select", path: string): void;
}>();

const grouped = computed<{ root: FileEntry[]; subdirs: Record<string, FileEntry[]> }>(() => {
  const root: FileEntry[] = [];
  const subdirs: Record<string, FileEntry[]> = {};
  for (const e of props.entries) {
    const slash = e.path.indexOf("/");
    if (slash === -1) {
      root.push(e);
    } else {
      const dir = e.path.slice(0, slash);
      (subdirs[dir] ||= []).push(e);
    }
  }
  return { root, subdirs };
});

function iconFor(kind: FileEntry["kind"]): "plugin" | "automations" {
  return kind === "pkl" ? "plugin" : "automations";
}
</script>

<template>
  <nav class="sy-tree">
    <ul class="sy-tree__list">
      <li
        v-for="e in grouped.root"
        :key="e.path"
        :class="['sy-tree__file', { 'sy-tree__file--active': selectedPath === e.path }]"
        @click="emit('select', e.path)"
      >
        <SyIcon :name="iconFor(e.kind)" :size="14" />
        <SyText as="span" variant="caption">{{ e.name }}</SyText>
      </li>
    </ul>
    <template v-for="(files, dir) in grouped.subdirs" :key="dir">
      <div class="sy-tree__dirhead">
        <SyText as="span" variant="caption" tone="subtle">{{ dir }}/</SyText>
      </div>
      <ul class="sy-tree__list">
        <li
          v-for="e in files"
          :key="e.path"
          :class="['sy-tree__file', 'sy-tree__file--nested', { 'sy-tree__file--active': selectedPath === e.path }]"
          @click="emit('select', e.path)"
        >
          <SyIcon :name="iconFor(e.kind)" :size="14" />
          <SyText as="span" variant="caption">{{ e.name }}</SyText>
        </li>
      </ul>
    </template>
  </nav>
</template>

<style scoped>
.sy-tree { display: flex; flex-direction: column; gap: var(--sy-space-2); padding: var(--sy-space-2); }
.sy-tree__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sy-tree__file {
  display: flex; align-items: center; gap: var(--sy-space-2);
  padding: 4px var(--sy-space-2); cursor: pointer; border-radius: var(--sy-radius-sm);
}
.sy-tree__file:hover { background: var(--sy-color-surface-2); }
.sy-tree__file--active { background: var(--sy-color-surface-3); }
.sy-tree__file--nested { padding-left: var(--sy-space-4); }
.sy-tree__dirhead { padding: 4px var(--sy-space-2) 0; }
</style>
