<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { ArrowUpRight, Loader2 } from "lucide-vue-next";
import { RouterLink } from "vue-router";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StatCard from "@/components/StatCard.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { api, HttpError } from "@/lib/api";
import { formatIDR, formatNumber, relativeTime, shortId } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import type { DashboardStats } from "@/types";

const auth = useAuthStore();

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
});

const stats = ref<DashboardStats | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    stats.value = await api.getStats();
  } catch (e) {
    error.value =
      e instanceof HttpError ? e.message : "Gagal memuat statistik";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const statusBreakdown = computed(() => {
  if (!stats.value) return [];
  return [
    {
      key: "PAID",
      label: "Lunas",
      count: stats.value.transactions.PAID.count,
      volume: stats.value.transactions.PAID.volume,
    },
    {
      key: "PENDING",
      label: "Menunggu",
      count: stats.value.transactions.PENDING.count,
      volume: stats.value.transactions.PENDING.volume,
    },
    {
      key: "EXPIRED",
      label: "Kedaluwarsa",
      count: stats.value.transactions.EXPIRED.count,
      volume: stats.value.transactions.EXPIRED.volume,
    },
    {
      key: "FAILED",
      label: "Gagal",
      count: stats.value.transactions.FAILED.count,
      volume: stats.value.transactions.FAILED.volume,
    },
  ];
});
</script>

<template>
  <div class="p-6 md:p-10 max-w-7xl mx-auto">
    <header class="mb-8 flex items-end justify-between gap-4">
      <div>
        <p
          class="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-2"
        >
          Ringkasan
        </p>
        <h1 class="font-display text-4xl italic">
          {{ greeting }}, <span class="text-primary">{{ auth.userName ?? "owner" }}</span>.
        </h1>
        <p class="text-sm text-muted-foreground mt-2">
          Yang terjadi pada payment gateway hari ini.
        </p>
      </div>
      <Button variant="outline" size="sm" @click="load" :disabled="loading">
        <Loader2 v-if="loading" class="size-4 animate-spin" />
        Refresh
      </Button>
    </header>

    <!-- Stat cards -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-10">
      <template v-if="loading">
        <Skeleton v-for="i in 4" :key="i" class="h-32 rounded-xl" />
      </template>
      <template v-else-if="stats">
        <StatCard
          label="Volume hari ini"
          :value="formatIDR(stats.volume.today)"
          :hint="`${stats.volume.todayCount} transaksi lunas`"
          accent="success"
        />
        <StatCard
          label="Total volume"
          :value="formatIDR(stats.volume.allTime)"
          :hint="`${stats.volume.allTimeCount} transaksi sepanjang masa`"
        />
        <StatCard
          label="Merchant aktif"
          :value="formatNumber(stats.merchants.active)"
          :hint="`${stats.merchants.total} total · ${stats.merchants.suspended} diskors`"
        />
        <StatCard
          label="Transaksi lunas"
          :value="formatNumber(stats.transactions.PAID.count)"
          :hint="`dari ${stats.transactions.PENDING.count} menunggu`"
          accent="success"
        />
      </template>
    </div>

    <div v-if="error" class="text-destructive text-sm mb-6">{{ error }}</div>

    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Status breakdown (2/3) -->
      <Card class="lg:col-span-2 p-6">
        <div class="flex items-baseline justify-between mb-4">
          <h2 class="font-display text-2xl italic">Transaksi per status</h2>
          <RouterLink
            to="/transactions"
            class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            Lihat semua <ArrowUpRight class="size-3" />
          </RouterLink>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div
            v-for="s in statusBreakdown"
            :key="s.key"
            class="border border-border rounded-lg p-4 flex flex-col gap-1"
          >
            <div class="flex items-center justify-between">
              <span
                class="text-[11px] uppercase tracking-wider text-muted-foreground"
                >{{ s.label }}</span
              >
              <StatusBadge :status="s.key" />
            </div>
            <p class="font-display text-3xl tabular-nums">
              {{ formatNumber(s.count) }}
            </p>
            <p class="text-xs text-muted-foreground font-mono">
              {{ formatIDR(s.volume) }}
            </p>
          </div>
        </div>
      </Card>

      <!-- Recent activity (1/3) -->
      <Card class="p-6">
        <h2 class="font-display text-2xl italic mb-4">Baru saja</h2>
        <Separator class="mb-3" />
        <div v-if="loading" class="space-y-3">
          <Skeleton v-for="i in 4" :key="i" class="h-14" />
        </div>
        <ul v-else-if="stats && stats.recentCreated.length" class="space-y-1">
          <li
            v-for="tx in stats.recentCreated"
            :key="tx.transactionId"
            class="py-2.5 border-b border-border/60 last:border-0"
          >
            <RouterLink
              :to="`/transactions/${tx.transactionId}`"
              class="block hover:bg-muted/40 -mx-2 px-2 rounded transition-colors"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium truncate">{{
                  tx.referenceId
                }}</span>
                <StatusBadge :status="tx.status" />
              </div>
              <div
                class="flex items-center justify-between mt-0.5 text-[11px] text-muted-foreground font-mono"
              >
                <span>{{ shortId(tx.transactionId, 6) }} · {{ tx.merchantName }}</span>
                <span>{{ relativeTime(tx.createdAt) }}</span>
              </div>
            </RouterLink>
          </li>
        </ul>
        <div v-else class="py-10 text-center text-sm text-muted-foreground">
          Belum ada transaksi.
        </div>
      </Card>
    </div>
  </div>
</template>
