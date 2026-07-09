<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  hint?: string;
  trend?: string;
  accent?: "primary" | "success" | "warning" | "destructive";
}>();
</script>

<template>
  <div class="card bg-base-100 border border-base-300 p-6 flex flex-col gap-1">
    <p class="text-[11px] uppercase tracking-[0.12em] text-base-content/60 font-medium">
      {{ label }}
    </p>
    <div class="flex items-baseline gap-2 mt-1">
      <span class="font-display text-4xl tabular-nums">{{ value }}</span>
      <span v-if="trend" class="text-xs text-base-content/60">{{ trend }}</span>
    </div>
    <p v-if="hint" class="text-xs text-base-content/60 mt-1 font-mono">
      {{ hint }}
    </p>
  </div>
</template>
