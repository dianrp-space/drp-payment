<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { toast } from "vue-sonner";
import {
  ArrowLeft,
  Copy,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Loader2,
} from "lucide-vue-next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/StatusBadge.vue";
import { api, HttpError } from "@/lib/api";
import {
  copyToClipboard,
  formatDateTime,
  formatIDR,
  relativeTime,
  timeUntil,
} from "@/lib/utils";
import type { TransactionDetail } from "@/types";

const route = useRoute();
const tx = ref<TransactionDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const expiry = computed(() => timeUntil(tx.value?.expiresAt));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    tx.value = await api.getTransaction(route.params.id as string);
  } catch (e) {
    error.value =
      e instanceof HttpError ? e.message : "Gagal memuat transaksi";
  } finally {
    loading.value = false;
  }
}

async function copy(text: string) {
  const ok = await copyToClipboard(text);
  if (ok) toast.success("Disalin");
  else toast.error("Gagal menyalin");
}

function downloadQr() {
  if (!tx.value) return;
  const a = document.createElement("a");
  a.href = tx.value.qrisImageBase64;
  a.download = `qris-${tx.value.referenceId}.png`;
  a.click();
}

onMounted(load);

const retrying = ref(false);

async function retryWebhook() {
  retrying.value = true;
  try {
    await api.retryWebhook(tx.value!.transactionId);
    toast.success("Webhook akan dikirim ulang");
    await load();
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal");
  } finally {
    retrying.value = false;
  }
}

function attemptIcon(success: boolean | null) {
  if (success === true) return CheckCircle2;
  if (success === false) return XCircle;
  return Clock;
}
</script>

<template>
  <div class="p-6 md:p-10 max-w-5xl mx-auto">
    <RouterLink
      to="/transactions"
      class="inline-flex items-center gap-1.5 text-sm text-base-content/60 hover:text-base-content mb-6"
    >
      <ArrowLeft class="size-4" /> Kembali ke daftar
    </RouterLink>

    <template v-if="loading">
      <Skeleton class="h-10 w-64 mb-3" />
      <Skeleton class="h-4 w-96 mb-8" />
      <div class="grid gap-4 md:grid-cols-3">
        <Skeleton class="h-48" />
        <Skeleton class="h-48 md:col-span-2" />
      </div>
    </template>

    <div v-else-if="error" class="text-error">{{ error }}</div>

    <template v-else-if="tx">
      <header class="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <StatusBadge :status="tx.status" />
            <span class="text-[11px] text-base-content/60 font-mono">
              {{ tx.transactionId }}
            </span>
          </div>
          <h1 class="font-display text-4xl italic">{{ tx.referenceId }}</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Dibuat {{ relativeTime(tx.createdAt) }} ·
            <RouterLink
              :to="`/merchants/${tx.merchant.id}`"
              class="hover:text-base-content underline underline-offset-2"
              >{{ tx.merchant.name }}</RouterLink
            >
          </p>
        </div>
      </header>

      <div class="grid gap-4 md:grid-cols-3">
        <!-- QR + nominal -->
        <Card class="p-6 flex flex-col items-center text-center">
          <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-3">
            Nominal harus dibayar
          </p>
          <p class="font-display text-4xl italic text-primary mb-4">
            {{ formatIDR(tx.totalAmount) }}
          </p>
          <div class="bg-white p-2 rounded-lg border border-base-300">
            <img
              :src="tx.qrisImageBase64"
              :alt="`QRIS untuk ${tx.referenceId}`"
              class="size-44 object-contain"
            />
          </div>
          <Button variant="outline" size="sm" class="mt-4" @click="downloadQr">
            <Download class="size-4" /> Unduh PNG
          </Button>
          <p
            v-if="tx.status === 'PENDING'"
            class="text-[11px] mt-3 font-mono"
            :class="expiry.past ? 'text-error' : 'text-base-content/60'"
          >
            <template v-if="expiry.past">
              Lewat batas waktu · menunggu konfirmasi expired
            </template>
            <template v-else>
              Kedaluwarsa {{ expiry.label }}
            </template>
          </p>
        </Card>

        <!-- Breakdown -->
        <Card class="p-6 md:col-span-2">
          <h2 class="font-display text-2xl italic mb-4">Rincian</h2>
          <dl class="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <dt class="text-base-content/60">Nominal dasar</dt>
            <dd class="font-mono text-right tabular-nums">{{ formatIDR(tx.amount) }}</dd>

            <dt class="text-base-content/60">Fee</dt>
            <dd class="font-mono text-right tabular-nums">{{ formatIDR(tx.fee) }}</dd>

            <dt class="text-base-content/60">Unique digit</dt>
            <dd class="font-mono text-right tabular-nums text-primary">+{{ tx.uniqueDigit }}</dd>

            <Separator class="col-span-2 my-1" />

            <dt class="font-medium">Total</dt>
            <dd class="font-mono text-right tabular-nums font-semibold">{{ formatIDR(tx.totalAmount) }}</dd>

            <dt class="text-base-content/60">Dibayar</dt>
            <dd class="font-mono text-right tabular-nums">
              {{ tx.paidAmount != null ? formatIDR(tx.paidAmount) : "—" }}
            </dd>

            <dt class="text-base-content/60">Sumber matched</dt>
            <dd class="font-mono text-right">{{ tx.matchedBy ?? "—" }}</dd>

            <dt class="text-base-content/60">Waktu bayar</dt>
            <dd class="font-mono text-right">
              {{ tx.paidAt ? formatDateTime(tx.paidAt) : "—" }}
            </dd>

            <dt class="text-base-content/60">Kedaluwarsa</dt>
            <dd class="font-mono text-right">{{ formatDateTime(tx.expiresAt) }}</dd>
          </dl>

          <Separator class="my-5" />

          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-[11px] uppercase tracking-wider text-base-content/60">
                String QRIS
              </p>
              <Button variant="ghost" size="sm" @click="copy(tx.qrisString)">
                <Copy class="size-3.5" /> Salin
              </Button>
            </div>
            <pre
              class="text-[11px] font-mono bg-base-200 border border-base-300 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed"
            >{{ tx.qrisString }}</pre>
          </div>
        </Card>
      </div>

      <!-- Webhook delivery log -->
      <Card class="p-6 mt-4">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-display text-2xl italic">Pengiriman webhook</h2>
            <p class="text-xs text-base-content/60 mt-0.5">
              Webhook URL: <span class="font-mono">{{ tx.merchant.webhookUrl ?? "—" }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              v-if="tx.status === 'PAID'"
              variant="outline"
              size="sm"
              :disabled="retrying"
              @click="retryWebhook"
            >
              <Loader2 v-if="retrying" class="size-3.5 animate-spin" />
              <Send v-else class="size-3.5" />
              Kirim ulang
            </Button>
            <StatusBadge :status="tx.webhookStatus" variant="webhook" />
          </div>
        </div>

        <div v-if="!tx.webhookLogs.length" class="text-sm text-base-content/60 py-4">
          Belum ada upaya pengiriman webhook.
        </div>
        <ul v-else class="divide-y divide-base-300">
          <li
            v-for="log in tx.webhookLogs"
            :key="log.id"
            class="py-3 flex items-start gap-3"
          >
            <component
              :is="attemptIcon(log.success)"
              class="size-4 mt-0.5 shrink-0"
              :class="
                log.success
                  ? 'text-success'
                  : log.success === false
                    ? 'text-error'
                    : 'text-base-content/60'
              "
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium">
                  Upaya #{{ log.attempt }} · {{ log.eventType }}
                </span>
                <span class="text-xs font-mono text-base-content/60">
                  HTTP {{ log.statusCode ?? "—" }} · {{ relativeTime(log.createdAt) }}
                </span>
              </div>
              <p v-if="log.errorMessage" class="text-xs text-error mt-1 font-mono">
                {{ log.errorMessage }}
              </p>
              <details v-if="log.responseBody" class="mt-1">
                <summary class="text-[11px] text-base-content/60 cursor-pointer hover:text-base-content">
                  Lihat response body
                </summary>
                <pre class="text-[11px] font-mono mt-2 bg-base-200 border border-base-300 rounded p-2 overflow-x-auto">{{ log.responseBody }}</pre>
              </details>
            </div>
          </li>
        </ul>
      </Card>
    </template>
  </div>
</template>
