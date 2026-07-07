<script setup lang="ts">
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import type { TransactionStatus, WebhookStatus } from "@/types";

const props = defineProps<{
  status: TransactionStatus | WebhookStatus | string;
  variant?: "transaction" | "webhook";
}>();

const map = computed(() => {
  const s = String(props.status);
  if (props.variant === "webhook") {
    const m: Record<string, { label: string; class: string }> = {
      NONE: { label: "Tidak ada", class: "bg-muted text-muted-foreground" },
      PENDING: { label: "Antri", class: "bg-warning/15 text-warning border-warning/30" },
      SENT: { label: "Terkirim", class: "bg-success/15 text-success border-success/30" },
      FAILED: { label: "Gagal", class: "bg-destructive/15 text-destructive border-destructive/30" },
    };
    return m[s] ?? { label: s, class: "bg-muted text-muted-foreground" };
  }
  const m: Record<string, { label: string; class: string }> = {
    PENDING: { label: "Menunggu", class: "bg-warning/15 text-warning border-warning/30" },
    PAID: { label: "Lunas", class: "bg-success/15 text-success border-success/30" },
    EXPIRED: { label: "Kedaluwarsa", class: "bg-muted text-muted-foreground" },
    FAILED: { label: "Gagal", class: "bg-destructive/15 text-destructive border-destructive/30" },
    ACTIVE: { label: "Aktif", class: "bg-success/15 text-success border-success/30" },
    SUSPENDED: { label: "Diskors", class: "bg-warning/15 text-warning border-warning/30" },
  };
  return m[s] ?? { label: s, class: "bg-muted text-muted-foreground" };
});
</script>

<template>
  <Badge
    variant="outline"
    class="font-mono text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-sm border"
    :class="map.class"
  >
    {{ map.label }}
  </Badge>
</template>
