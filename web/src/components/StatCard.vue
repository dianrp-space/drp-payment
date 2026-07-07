<script setup lang="ts">
import { Card } from "@/components/ui/card";

defineProps<{
  label: string;
  value: string | number;
  hint?: string;
  trend?: string;
  accent?: "primary" | "success" | "warning" | "destructive";
}>();
</script>

<template>
  <Card class="p-6 flex flex-col gap-1 bg-card border-border">
    <p
      class="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-medium"
    >
      {{ label }}
    </p>
    <div class="flex items-baseline gap-2 mt-1">
      <span class="font-display text-4xl tabular-nums">{{ value }}</span>
      <span v-if="trend" class="text-xs text-muted-foreground">{{ trend }}</span>
    </div>
    <p v-if="hint" class="text-xs text-muted-foreground mt-1 font-mono">
      {{ hint }}
    </p>
  </Card>
</template>
