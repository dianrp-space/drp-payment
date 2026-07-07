<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Search, ChevronLeft, ChevronRight, Loader2, Copy } from "lucide-vue-next";
import { toast } from "vue-sonner";
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

function goPage(delta: number) {
  const next = Math.max(1, Math.min(pagination.value.totalPages, pagination.value.page + delta));
  if (next !== pagination.value.page) {
    pagination.value.page = next;
    load();
  }
}

onMounted(load);

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
      return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "POST":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "PATCH":
    case "PUT":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "DELETE":
      return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusClass(code: number): string {
  if (code >= 500) return "text-rose-600 dark:text-rose-400 font-medium";
  if (code >= 400) return "text-amber-600 dark:text-amber-400 font-medium";
  if (code >= 300) return "text-sky-600 dark:text-sky-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function openDetail(log: ApiLog) {
  selectedLog.value = log;
  dialogOpen.value = true;
}
</script>

<template>
  <div class="p-6 md:p-10 max-w-7xl mx-auto">
    <header class="mb-8">
      <p class="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
        Forensik
      </p>
      <h1 class="font-display text-4xl italic">Audit Log</h1>
      <p class="text-sm text-muted-foreground mt-2">
        Jejak panggilan API masuk (inbound) lintas merchant, urut paling baru.
        Berguna untuk debugging & forensik.
      </p>
    </header>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row gap-3 mb-5">
      <div class="relative flex-1 max-w-md">
        <Search
          class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
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
      class="border border-destructive/40 bg-destructive/5 text-destructive rounded-md px-4 py-3 text-sm mb-4"
    >
      {{ error }}
    </div>

    <div
      class="border border-border rounded-xl overflow-hidden bg-card"
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
            <TableCell :colspan="7" class="text-center py-12 text-muted-foreground">
              <Loader2 class="size-5 animate-spin inline-block" />
            </TableCell>
          </TableRow>
          <TableRow v-else-if="!items.length">
            <TableCell :colspan="7" class="text-center py-12 text-muted-foreground">
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
            <TableCell class="font-mono text-xs text-muted-foreground">
              {{ row.merchantId ? shortId(row.merchantId, 10) : "—" }}
            </TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">
              {{ row.ip ?? "—" }}
            </TableCell>
            <TableCell class="text-right font-mono tabular-nums text-xs text-muted-foreground">
              {{ row.durationMs != null ? `${row.durationMs} ms` : "—" }}
            </TableCell>
            <TableCell class="text-right text-xs text-muted-foreground font-mono">
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
      <span class="text-muted-foreground font-mono text-xs">{{ rangeText }}</span>
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
            <span class="text-sm font-mono font-normal text-muted-foreground break-all leading-relaxed">
              {{ selectedLog?.path }}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-4 text-sm" v-if="selectedLog">
          <!-- Waktu & Durasi -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Waktu</span>
              <p class="font-mono text-xs mt-1">{{ formatDateTime(selectedLog.createdAt) }}</p>
            </div>
            <div>
              <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Durasi</span>
              <p class="font-mono text-xs mt-1">{{ selectedLog.durationMs != null ? `${selectedLog.durationMs} ms` : "—" }}</p>
            </div>
          </div>

          <!-- Status -->
          <div>
            <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</span>
            <p :class="['font-mono text-sm mt-1', statusClass(selectedLog.statusCode)]">{{ selectedLog.statusCode }}</p>
          </div>

          <!-- Path (full) -->
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Path</span>
              <Button variant="ghost" size="sm" class="h-6 gap-1 text-xs" @click="copyToClipboard(selectedLog.path); toast.info('Path disalin')">
                <Copy class="size-3" /> Salin
              </Button>
            </div>
            <pre class="font-mono text-xs mt-1 break-all whitespace-pre-wrap bg-muted/50 rounded-md px-3 py-2 max-h-32 overflow-y-auto">{{ selectedLog.path }}</pre>
          </div>

          <!-- Merchant -->
          <div>
            <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Merchant ID</span>
            <div class="flex items-center gap-2 mt-1">
              <span class="font-mono text-xs">{{ selectedLog.merchantId ?? "—" }}</span>
              <Button v-if="selectedLog.merchantId" variant="ghost" size="sm" class="h-6 gap-1 text-xs" @click="copyToClipboard(selectedLog.merchantId); toast.info('Merchant ID disalin')">
                <Copy class="size-3" /> Salin
              </Button>
            </div>
          </div>

          <!-- IP -->
          <div>
            <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">IP Address</span>
            <p class="font-mono text-xs mt-1">{{ selectedLog.ip ?? "—" }}</p>
          </div>

          <!-- User-Agent -->
          <div>
            <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">User-Agent</span>
            <p class="text-xs mt-1 break-all">{{ selectedLog.userAgent ?? "—" }}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
