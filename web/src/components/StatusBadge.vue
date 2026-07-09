<script setup lang="ts">
import { computed } from "vue";
import type { TransactionStatus, WebhookStatus } from "@/types";

const props = defineProps<{
  status: TransactionStatus | WebhookStatus | string;
  variant?: "transaction" | "webhook";
}>();

const map = computed(() => {
  const s = String(props.status);
  if (props.variant === "webhook") {
    const m: Record<string, { label: string; color: string }> = {
      NONE: { label: "Tidak ada", color: "" },
      PENDING: { label: "Antri", color: "badge-warning" },
      SENT: { label: "Terkirim", color: "badge-success" },
      FAILED: { label: "Gagal", color: "badge-error" },
    };
    return m[s] ?? { label: s, color: "" };
  }
  const m: Record<string, { label: string; color: string }> = {
    PENDING: { label: "Menunggu", color: "badge-warning" },
    PAID: { label: "Lunas", color: "badge-success" },
    EXPIRED: { label: "Kedaluwarsa", color: "" },
    FAILED: { label: "Gagal", color: "badge-error" },
    ACTIVE: { label: "Aktif", color: "badge-success" },
    SUSPENDED: { label: "Diskors", color: "badge-warning" },
  };
  return m[s] ?? { label: s, color: "" };
});
</script>

<template>
  <span class="badge badge-outline font-mono text-[11px] uppercase tracking-wide font-medium" :class="map.color">
    {{ map.label }}
  </span>
</template>
