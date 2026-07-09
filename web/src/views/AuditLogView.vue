<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Search, ChevronLeft, ChevronRight, Loader2, Copy, Trash2, Settings2 } from "@lucide/vue";
import { toast } from "vue-sonner";
import Swal from "sweetalert2";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, HttpError } from "@/lib/api";
import { formatDateTime, shortId, copyToClipboard } from "@/lib/utils";
import type { ApiLog, Paginated } from "@/types";

type HttpMethod = ApiLog["method"] | "ALL";
type StatusBucket = "ALL" | "2xx" | "3xx" | "4xx" | "5xx";

const items = ref<ApiLog[]>([]);
const selectedLog = ref<ApiLog | null>(null);
const dialogOpen = ref(false);
const pagination = ref<Paginated<ApiLog>["pagination"]>({
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
});
const loading = ref(false);
const error = ref<string | null>(null);

const methodFilter = ref<HttpMethod>("ALL");
const statusFilter = ref<StatusBucket>("ALL");
const search = ref("");
const searchInput = ref("");
let debounce: ReturnType<typeof setTimeout> | null = null;

// --- Cleanup state ---
const cleanupDays = ref(30);
const cleaningUp = ref(false);
const auditStats = ref<{ total: number; oldest: string | null; newest: string | null } | null>(null);

// --- Auto-cleanup settings ---
const autoCleanupEnabled = ref(true);
const autoCleanupRetention = ref(30);
const autoCleanupInterval = ref(6);
const autoCleanupLoading = ref(false);
const autoCleanupSaving = ref(false);
const showAutoSettings = ref(false);

watch(searchInput, (v) => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    search.value = v.trim();
    pagination.value.page = 1;
    load();
  }, 350);
});

watch([methodFilter, statusFilter], () => {
  pagination.value.page = 1;
  load();
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [statusCodeFrom, statusCodeTo] =
      statusFilter.value === "ALL"
        ? [undefined, undefined]
        : statusFilter.value === "2xx"
        ? [200, 299]
        : statusFilter.value === "3xx"
        ? [300, 399]
        : statusFilter.value === "4xx"
        ? [400, 499]
        : [500, 599];
    const res = await api.listAuditLogs({
      page: pagination.value.page,
      limit: pagination.value.limit,
      method: methodFilter.value === "ALL" ? undefined : methodFilter.value,
      statusCodeFrom,
      statusCodeTo,
      q: search.value || undefined,
    });
    items.value = res.items;
    pagination.value = res.pagination;
  } catch (e) {
    error.value = e instanceof HttpError ? e.message : "Gagal memuat audit log";
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    auditStats.value = await api.getAuditStats();
  } catch {
    // silent
  }
}

async function loadAutoCleanup() {
  autoCleanupLoading.value = true;
  try {
    const res = await api.getAuditCleanupSettings();
    autoCleanupEnabled.value = res.settings.enabled;
    autoCleanupRetention.value = res.settings.retentionDays;
    autoCleanupInterval.value = res.settings.intervalHours;
  } catch {
    // silent
  } finally {
    autoCleanupLoading.value = false;
  }
}

async function saveAutoCleanup() {
  autoCleanupSaving.value = true;
  try {
    const res = await api.updateAuditCleanupSettings({
      enabled: autoCleanupEnabled.value,
      retentionDays: autoCleanupRetention.value,
      intervalHours: autoCleanupInterval.value,
    });
    autoCleanupEnabled.value = res.settings.enabled;
    autoCleanupRetention.value = res.settings.retentionDays;
    autoCleanupInterval.value = res.settings.intervalHours;
    toast.success("Pengaturan auto-cleanup disimpan");
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal menyimpan pengaturan");
  } finally {
    autoCleanupSaving.value = false;
  }
}

function goPage(delta: number) {
  const next = Math.max(1, Math.min(pagination.value.totalPages, pagination.value.page + delta));
  if (next !== pagination.value.page) {
    pagination.value.page = next;
    load();
  }
}

onMounted(() => {
  load();
  loadStats();
  loadAutoCleanup();
});

const rangeText = computed(() => {
  const { page, limit, total } = pagination.value;
  if (total === 0) return "Tidak ada hasil";
  const start = (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);
  return `${start}–${end} dari ${total}`;
});

function methodClass(m: ApiLog["method"]): string {
  switch (m) {
    case "GET":
      return "bg-info/10 text-info";
    case "POST":
      return "bg-success/10 text-success";
    case "PATCH":
    case "PUT":
      return "bg-warning/10 text-warning";
    case "DELETE":
      return "bg-error/10 text-error";
    default:
      return "bg-base-200 text-base-content/60";
  }
}

function statusClass(code: number): string {
  if (code >= 500) return "text-error font-medium";
  if (code >= 400) return "text-warning font-medium";
  if (code >= 300) return "text-info";
  return "text-success";
}

function openDetail(log: ApiLog) {
  selectedLog.value = log;
  dialogOpen.value = true;
}

async function handleCleanup() {
  const days = cleanupDays.value;
  const result = await Swal.fire({
    icon: "warning",
    title: `Hapus log lebih lama dari ${days} hari?`,
    text: `Semua audit log sebelum ${formatDateTime(new Date(Date.now() - days * 86400000))} akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`,
    showCancelButton: true,
    confirmButtonText: "Hapus",
    cancelButtonText: "Batal",
    confirmButtonColor: "#dc2626",
    reverseButtons: true,
    input: "number",
    inputValue: days,
    inputLabel: "Jumlah hari",
    inputAttributes: { min: "1", max: "3650", step: "1" },
    inputValidator: (val) => {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 1) return "Masukkan angka minimal 1";
      if (n > 3650) return "Maksimal 3650 hari (10 tahun)";
    },
  });
  if (!result.isConfirmed) return;

  const finalDays = Number(result.value);
  cleaningUp.value = true;
  try {
    const res = await api.cleanupAuditLogs(finalDays);
    Swal.fire({
      icon: "success",
      title: `${res.deleted} log dihapus`,
      text: `Log lebih lama dari ${finalDays} hari telah dibersihkan.`,
      timer: 2500,
      timerProgressBar: true,
      showConfirmButton: false,
    });
    pagination.value.page = 1;
    await Promise.all([load(), loadStats()]);
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "Gagal membersihkan audit log";
    Swal.fire({ icon: "error", title: "Gagal", text: msg, confirmButtonColor: "var(--primary)" });
  } finally {
    cleaningUp.value = false;
  }
}
</script>

<template>
  <div class="p-6 md:p-10 max-w-7xl mx-auto">
    <header class="mb-8 flex items-end justify-between gap-4">
      <div>
        <p class="text-[11px] uppercase tracking-[0.15em] text-base-content/60 mb-2">
          Forensik
        </p>
        <h1 class="font-display text-4xl italic">Audit Log</h1>
        <p class="text-sm text-base-content/60 mt-2">
          Jejak panggilan API masuk (inbound) lintas merchant, urut paling baru.
          <span v-if="auditStats" class="font-mono text-xs">
            Total {{ auditStats.total.toLocaleString("id-ID") }} log.
          </span>
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        :disabled="cleaningUp"
        @click="handleCleanup"
        class="gap-2 shrink-0 text-error hover:text-error"
      >
        <Loader2 v-if="cleaningUp" class="size-4 animate-spin" />
        <Trash2 v-else class="size-4" />
        <span class="hidden sm:inline">Bersihkan Log Lama</span>
      </Button>
    </header>

    <!-- Auto-cleanup info bar -->
    <div class="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg border border-base-300 bg-base-100/50 text-sm">
      <div class="flex items-center gap-2 text-base-content/60">
        <span
          :class="[
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
            autoCleanupEnabled
              ? 'bg-success/10 text-success'
              : 'bg-base-200 text-base-content/60'
          ]"
        >
          <span class="size-1.5 rounded-full" :class="autoCleanupEnabled ? 'bg-success' : 'bg-base-content/60'" />
          {{ autoCleanupLoading ? "…" : autoCleanupEnabled ? "Auto-cleanup aktif" : "Auto-cleanup nonaktif" }}
        </span>
        <span v-if="autoCleanupEnabled && !autoCleanupLoading" class="text-xs">
          Hapus log lebih lama dari <strong class="text-base-content">{{ autoCleanupRetention }} hari</strong> setiap <strong class="text-base-content">{{ autoCleanupInterval }} jam</strong>
        </span>
      </div>
      <Button variant="ghost" size="sm" class="gap-1.5 text-xs" @click="showAutoSettings = !showAutoSettings">
        <Settings2 class="size-3.5" />
        {{ showAutoSettings ? "Tutup" : "Atur" }}
      </Button>
    </div>

    <!-- Auto-cleanup settings panel -->
    <div v-if="showAutoSettings" class="mb-5 p-5 rounded-lg border border-base-300 bg-base-100 space-y-4">
      <div>
        <h3 class="text-sm font-medium mb-1">Auto-Cleanup Audit Log</h3>
        <p class="text-xs text-base-content/60">
          Server otomatis menghapus audit log yang lebih lama dari jumlah hari yang ditetapkan, setiap 6 jam sekali.
        </p>
      </div>

      <div class="flex flex-col sm:flex-row gap-4 sm:items-end">
        <div class="flex-1 max-w-xs">
          <label class="text-xs uppercase tracking-wider text-base-content/60 font-medium mb-1.5 block">
            Retention (hari)
          </label>
          <Input
            v-model.number="autoCleanupRetention"
            type="number"
            min="1"
            max="3650"
            placeholder="30"
            :disabled="autoCleanupLoading || autoCleanupSaving"
            class="font-mono"
          />
        </div>
        <div class="flex-1 max-w-xs">
          <label class="text-xs uppercase tracking-wider text-base-content/60 font-medium mb-1.5 block">
            Interval (jam)
          </label>
          <Input
            v-model.number="autoCleanupInterval"
            type="number"
            min="1"
            max="168"
            placeholder="6"
            :disabled="autoCleanupLoading || autoCleanupSaving"
            class="font-mono"
          />
        </div>
        <label class="flex items-center gap-2 cursor-pointer select-none pb-2">
          <input
            type="checkbox"
            v-model="autoCleanupEnabled"
            :disabled="autoCleanupLoading || autoCleanupSaving"
            class="size-4 rounded border-base-300 accent-primary"
          />
          <span class="text-sm">Aktifkan</span>
        </label>
        <Button
          size="sm"
          :disabled="autoCleanupLoading || autoCleanupSaving"
          @click="saveAutoCleanup"
          class="gap-1.5"
        >
          <Loader2 v-if="autoCleanupSaving" class="size-3.5 animate-spin" />
          Simpan
        </Button>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row gap-3 mb-5">
      <div class="relative flex-1 max-w-md">
        <Search
          class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-content/60 pointer-events-none"
        />
        <Input
          v-model="searchInput"
          placeholder="Cari path, merchantId, atau IP…"
          class="pl-9 font-mono text-sm"
        />
      </div>
      <Select v-model="methodFilter">
        <SelectTrigger class="w-full sm:w-36">
          <SelectValue placeholder="Semua method" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Semua method</SelectItem>
          <SelectItem value="GET">GET</SelectItem>
          <SelectItem value="POST">POST</SelectItem>
          <SelectItem value="PATCH">PATCH</SelectItem>
          <SelectItem value="PUT">PUT</SelectItem>
          <SelectItem value="DELETE">DELETE</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="statusFilter">
        <SelectTrigger class="w-full sm:w-36">
          <SelectValue placeholder="Semua status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Semua status</SelectItem>
          <SelectItem value="2xx">2xx Sukses</SelectItem>
          <SelectItem value="3xx">3xx Redirect</SelectItem>
          <SelectItem value="4xx">4xx Client error</SelectItem>
          <SelectItem value="5xx">5xx Server error</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div
      v-if="error"
      class="border border-error/40 bg-error/5 text-error rounded-md px-4 py-3 text-sm mb-4"
    >
      {{ error }}
    </div>

    <div
      class="border border-base-300 rounded-xl overflow-hidden bg-base-100"
    >
      <Table>
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead class="w-[10%]">Method</TableHead>
            <TableHead class="w-[36%]">Path</TableHead>
            <TableHead class="w-[8%] text-right">Status</TableHead>
            <TableHead class="w-[10%]">Merchant</TableHead>
            <TableHead class="w-[12%]">IP</TableHead>
            <TableHead class="w-[8%] text-right">Durasi</TableHead>
            <TableHead class="w-[16%] text-right">Waktu</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading && !items.length">
            <TableCell :colspan="7" class="text-center py-12 text-base-content/60">
              <Loader2 class="size-5 animate-spin inline-block" />
            </TableCell>
          </TableRow>
          <TableRow v-else-if="!items.length">
            <TableCell :colspan="7" class="text-center py-12 text-base-content/60">
              Tidak ada log untuk filter ini.
            </TableCell>
          </TableRow>
          <TableRow
            v-for="row in items"
            :key="row.id"
            class="cursor-pointer"
            @click="openDetail(row)"
          >
            <TableCell>
              <span
                :class="[
                  'inline-flex items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold w-12',
                  methodClass(row.method),
                ]"
              >
                {{ row.method }}
              </span>
            </TableCell>
            <TableCell class="font-mono text-xs max-w-[200px]">
              <div class="truncate">{{ row.path }}</div>
            </TableCell>
            <TableCell :class="['text-right font-mono tabular-nums text-sm', statusClass(row.statusCode)]">
              {{ row.statusCode }}
            </TableCell>
            <TableCell class="font-mono text-xs text-base-content/60">
              {{ row.merchantId ? shortId(row.merchantId, 10) : "—" }}
            </TableCell>
            <TableCell class="font-mono text-xs text-base-content/60">
              {{ row.ip ?? "—" }}
            </TableCell>
            <TableCell class="text-right font-mono tabular-nums text-xs text-base-content/60">
              {{ row.durationMs != null ? `${row.durationMs} ms` : "—" }}
            </TableCell>
            <TableCell class="text-right text-xs text-base-content/60 font-mono">
              {{ formatDateTime(row.createdAt) }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Pagination -->
    <div
      v-if="pagination.total > 0"
      class="flex items-center justify-between mt-4 text-sm"
    >
      <span class="text-base-content/60 font-mono text-xs">{{ rangeText }}</span>
      <div class="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          :disabled="pagination.page <= 1 || loading"
          @click="goPage(-1)"
        >
          <ChevronLeft class="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="pagination.page >= pagination.totalPages || loading"
          @click="goPage(1)"
        >
          <ChevronRight class="size-4" />
        </Button>
      </div>
    </div>

    <!-- Detail dialog -->
    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle class="flex items-start gap-2 font-mono text-base">
            <span
              :class="[
                'inline-flex items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold w-12 shrink-0 mt-0.5',
                methodClass(selectedLog?.method ?? 'GET'),
              ]"
            >
              {{ selectedLog?.method }}
            </span>
            <span class="text-sm font-mono font-normal text-base-content/60 break-all leading-relaxed">
              {{ selectedLog?.path }}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-4 text-sm" v-if="selectedLog">
          <!-- Waktu & Durasi -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <span class="text-[10px] uppercase tracking-wider text-base-content/60 font-medium">Waktu</span>
              <p class="font-mono text-xs mt-1">{{ formatDateTime(selectedLog.createdAt) }}</p>
            </div>
            <div>
              <span class="text-[10px] uppercase tracking-wider text-base-content/60 font-medium">Durasi</span>
              <p class="font-mono text-xs mt-1">{{ selectedLog.durationMs != null ? `${selectedLog.durationMs} ms` : "—" }}</p>
            </div>
          </div>

          <!-- Status -->
          <div>
            <span class="text-[10px] uppercase tracking-wider text-base-content/60 font-medium">Status</span>
            <p :class="['font-mono text-sm mt-1', statusClass(selectedLog.statusCode)]">{{ selectedLog.statusCode }}</p>
          </div>

          <!-- Path (full) -->
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[10px] uppercase tracking-wider text-base-content/60 font-medium">Path</span>
              <Button variant="ghost" size="sm" class="h-6 gap-1 text-xs" @click="copyToClipboard(selectedLog.path); toast.info('Path disalin')">
                <Copy class="size-3" /> Salin
              </Button>
            </div>
            <pre class="font-mono text-xs mt-1 break-all whitespace-pre-wrap bg-base-200/50 rounded-md px-3 py-2 max-h-32 overflow-y-auto">{{ selectedLog.path }}</pre>
          </div>

          <!-- Merchant -->
          <div>
            <span class="text-[10px] uppercase tracking-wider text-base-content/60 font-medium">Merchant ID</span>
            <div class="flex items-center gap-2 mt-1">
              <span class="font-mono text-xs">{{ selectedLog.merchantId ?? "—" }}</span>
              <Button v-if="selectedLog.merchantId" variant="ghost" size="sm" class="h-6 gap-1 text-xs" @click="copyToClipboard(selectedLog.merchantId); toast.info('Merchant ID disalin')">
                <Copy class="size-3" /> Salin
              </Button>
            </div>
          </div>

          <!-- IP -->
          <div>
            <span class="text-[10px] uppercase tracking-wider text-base-content/60 font-medium">IP Address</span>
            <p class="font-mono text-xs mt-1">{{ selectedLog.ip ?? "—" }}</p>
          </div>

          <!-- User-Agent -->
          <div>
            <span class="text-[10px] uppercase tracking-wider text-base-content/60 font-medium">User-Agent</span>
            <p class="text-xs mt-1 break-all">{{ selectedLog.userAgent ?? "—" }}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
