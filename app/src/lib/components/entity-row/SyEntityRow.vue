<!--
  SyEntityRow — one entity in a list, with appropriate inline controls.

  Owns the optimistic-apply + callCapability orchestration so the per-
  capability widgets stay dumb. Errors surface inline below the header
  and auto-dismiss after 3s.

  Layout:
    [icon] friendly_name [type-badge] [availability-dot] · primary state
                                                         [inline control]
    (expanded)
       brightness slider
       color temp slider (if supported)
       color picker      (if supported)

  Click on the row body toggles `expanded` for light entities (the only
  kind with secondary controls). Sensors & switches collapse to just
  the row header — no expansion target.
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  SyText, SyDot, SyBadge, SyIcon,
  SyEntityToggle, SyBrightnessSlider, SyColorTempSlider,
  SyColorPicker, SySensorValue,
} from "@/lib";
import type { Entity } from "@/data/entities";
import { callCapability } from "@/data/call-capability";
import { entityStore } from "@/stores/entity-store";

const props = defineProps<{
  entity: Entity;
}>();

const expanded = ref<boolean>(false);
const inlineError = ref<string>("");
const busy = ref<boolean>(false);
let errorTimer: number | null = null;

function setError(msg: string): void {
  inlineError.value = msg;
  if (errorTimer !== null) window.clearTimeout(errorTimer);
  errorTimer = window.setTimeout(() => { inlineError.value = ""; }, 3_000);
}

const kind = computed<"light" | "switch" | "numeric_sensor" | "binary_sensor" | "unknown">(() => {
  const s = props.entity.state ?? {};
  if (s.light) return "light";
  if (s.switchDevice) return "switch";
  if (s.numericSensor) return "numeric_sensor";
  if (s.binarySensor) return "binary_sensor";
  return "unknown";
});

const available = computed<boolean>(() => !!props.entity.state?.available);

const primaryLine = computed<string>(() => {
  const s = props.entity.state;
  if (kind.value === "light" && s?.light) {
    if (!s.light.on) return "off";
    const pct = Math.round(((s.light.brightness ?? 0) / 255) * 100);
    return `on · ${pct}%`;
  }
  if (kind.value === "switch" && s?.switchDevice) {
    return s.switchDevice.on ? "on" : "off";
  }
  if (kind.value === "numeric_sensor" && s?.numericSensor) {
    return `${s.numericSensor.value} ${s.numericSensor.unit}`;
  }
  if (kind.value === "binary_sensor" && s?.binarySensor) {
    return s.binarySensor.on ? "active" : "idle";
  }
  return "";
});

const supportsColorTemp = computed<boolean>(() =>
  (props.entity.capabilities?.light?.colorTemp ?? 0) !== 0);
const supportsColor = computed<boolean>(() =>
  (props.entity.capabilities?.light?.colorRgb ?? 0) !== 0);

async function withCall(
  patch: Partial<Entity>,
  capability: string,
  parameters: Record<string, unknown>,
): Promise<void> {
  const revert = entityStore.applyOptimistic(props.entity.id, patch);
  busy.value = true;
  try {
    const r = await callCapability(props.entity.id, capability, parameters);
    if (!r.success) {
      revert();
      setError(r.errorMessage || "Command rejected by driver");
    }
  } catch (err) {
    revert();
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    busy.value = false;
  }
}

function onToggle(next: boolean): void {
  const cap = next ? "turn_on" : "turn_off";
  if (kind.value === "light") {
    void withCall(
      { state: { ...props.entity.state, light: { ...(props.entity.state?.light ?? {}), on: next } } },
      cap, {},
    );
  } else if (kind.value === "switch") {
    void withCall(
      { state: { ...props.entity.state, switchDevice: { on: next } } },
      cap, {},
    );
  }
}
function onBrightness(next: number): void {
  void withCall(
    { state: { ...props.entity.state, light: { ...(props.entity.state?.light ?? {}), brightness: next, on: true } } },
    "set_brightness", { value: String(next) },
  );
}
function onColorTemp(next: number): void {
  void withCall(
    { state: { ...props.entity.state, light: { ...(props.entity.state?.light ?? {}), colorTemp: next } } },
    "set_color_temp", { mireds: String(next) },
  );
}
function onColor(rgbHex: string): void {
  const n = parseInt(rgbHex, 16);
  void withCall(
    { state: { ...props.entity.state, light: { ...(props.entity.state?.light ?? {}), colorRgb: n } } },
    "set_color", { rgb: rgbHex },
  );
}

function toggleExpand(): void {
  if (kind.value === "light") expanded.value = !expanded.value;
}
</script>

<template>
  <div class="sy-er" :class="{ 'sy-er--expanded': expanded }">
    <div class="sy-er__head" :class="{ 'sy-er__head--clickable': kind === 'light' }" @click="toggleExpand">
      <SyIcon
        :name="kind === 'light' ? 'bulb' : kind === 'switch' ? 'plugin' : 'activity'"
        :size="18"
      />
      <div class="sy-er__title">
        <SyText variant="body" weight="medium">{{ entity.friendlyName || entity.id }}</SyText>
        <div class="sy-er__sub">
          <SyBadge intent="neutral" size="sm">{{ entity.type }}</SyBadge>
          <SyDot :intent="available ? 'good' : 'neutral'" />
          <SyText variant="caption" tone="subtle">{{ primaryLine }}</SyText>
        </div>
      </div>

      <div class="sy-er__inline" @click.stop>
        <SyEntityToggle
          v-if="kind === 'light'"
          :on="entity.state?.light?.on ?? false"
          :busy="busy"
          @change="onToggle"
        />
        <SyEntityToggle
          v-else-if="kind === 'switch'"
          :on="entity.state?.switchDevice?.on ?? false"
          :busy="busy"
          @change="onToggle"
        />
        <SySensorValue
          v-else-if="kind === 'numeric_sensor'"
          :value="entity.state?.numericSensor?.value ?? 0"
          :unit="entity.state?.numericSensor?.unit"
        />
        <SySensorValue
          v-else-if="kind === 'binary_sensor'"
          :value="entity.state?.binarySensor?.on ?? false"
        />
      </div>
    </div>

    <SyText v-if="inlineError" variant="caption" tone="bad" class="sy-er__err">
      {{ inlineError }}
    </SyText>

    <div v-if="expanded && kind === 'light'" class="sy-er__controls" @click.stop>
      <SyBrightnessSlider
        :value="entity.state?.light?.brightness ?? 0"
        :busy="busy"
        @commit="onBrightness"
      />
      <SyColorTempSlider
        v-if="supportsColorTemp"
        :value="entity.state?.light?.colorTemp ?? 0"
        :busy="busy"
        @commit="onColorTemp"
      />
      <SyColorPicker
        v-if="supportsColor"
        :value="entity.state?.light?.colorRgb ?? 0"
        :busy="busy"
        @commit="onColor"
      />
    </div>
  </div>
</template>

<style scoped>
.sy-er {
  display: flex; flex-direction: column;
  padding: var(--sy-space-2) var(--sy-space-3);
  gap: var(--sy-space-2);
}
.sy-er + .sy-er { border-top: 1px solid var(--sy-color-line-soft); }
.sy-er__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--sy-space-3);
}
.sy-er__head--clickable { cursor: pointer; }
.sy-er__title { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sy-er__sub { display: flex; align-items: center; gap: var(--sy-space-2); }
.sy-er__inline { display: flex; align-items: center; gap: var(--sy-space-2); }
.sy-er__controls {
  display: flex; flex-direction: column; gap: var(--sy-space-2);
  padding-top: var(--sy-space-1);
}
</style>
