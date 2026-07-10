<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { Search, ChevronLeft, ChevronRight, Loader2, Trash2 } from "@lucide/vue";
import Swal from "sweetalert2";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge.vue";
import { api, HttpError } from "@/lib/api";
import { formatIDR, formatDateTime, shortId } from "@/lib/utils";
import type { Paginated, Transaction, TransactionStatus } from "@/types";

const items = ref<Transaction[]>([]);
const pagination = ref<Paginated<Transaction>["pagination"]>({
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
});
const loading = ref(false);
const error = ref<string | null>(null);

const statusFilter = ref<TransactionStatus | "ALL">("ALL");
const search = ref("");
const searchInput = ref(""); // debounced
let debounce: ReturnType<typeof setTimeout> | null = null;

watch(searchInput, (v) => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    search.value = v.trim();
    pagination.value.page = 1;
    load();
  }, 350);
});

watch(statusFilter, () => {
  pagination.value.page = 1;
  load();
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await api.listTransactions({
      page: pagination.value.page,
      limit: pagination.value.limit,
      status: statusFilter.value === "ALL" ? undefined : statusFilter.value,
      q: search.value || undefined,
    });
    items.value = res.items;
    pagination.value = res.pagination;
  } catch (e) {
    error.value = e instanceof HttpError ? e.message : "Gagal memuat transaksi";
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

const deleting = ref<string | null>(null);

async function confirmDelete(tx: Transaction) {
  const result = await Swal.fire({
    icon: "warning",
    title: "Hapus transaksi",
    text: `Yakin ingin menghapus "${tx.referenceId}"? Tindakan ini tidak bisa dibatalkan.`,
    showCancelButton: true,
    confirmButtonText: "Hapus",
    cancelButtonText: "Batal",
    confirmButtonColor: "#dc2626",
  });
  if (!result.isConfirmed) return;

  deleting.value = tx.transactionId;
  try {
    await api.deleteTransaction(tx.transactionId);
    toast.success("Transaksi dihapus");
    load();
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal menghapus");
  } finally {
    deleting.value = null;
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
</script>

<template>
  <div class="p-6 md:p-10 max-w-7xl mx-auto">
    <header class="mb-8">
      <p class="text-[11px] uppercase tracking-[0.15em] text-base-content/60 mb-2">
        Buku besar
      </p>
      <h1 class="font-display text-4xl italic">Transaksi</h1>
      <p class="text-sm text-base-content/60 mt-2">
        Semua transaksi lintas merchant, urut paling baru.
      </p>
    </header>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row gap-3 mb-5">
      <div class="relative flex-1 max-w-md">
        <Search
          class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-content/60 pointer-events-none"
        />
        <Input
          v-model="searchInput"
          placeholder="Cari referenceId atau transactionId…"
          class="pl-9 font-mono text-sm"
        />
      </div>
      <Select v-model="statusFilter">
        <SelectTrigger class="w-full sm:w-44">
          <SelectValue placeholder="Semua status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Semua status</SelectItem>
          <SelectItem value="PENDING">Menunggu</SelectItem>
          <SelectItem value="PAID">Lunas</SelectItem>
          <SelectItem value="EXPIRED">Kedaluwarsa</SelectItem>
          <SelectItem value="FAILED">Gagal</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div
      class="border border-base-300 rounded-xl overflow-hidden bg-base-100"
    >
      <Table>
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead class="w-[28%]">Reference</TableHead>
            <TableHead>Merchant</TableHead>
            <TableHead class="text-right">Nominal</TableHead>
            <TableHead>Status</TableHead>
            <TableHead class="text-right">Dibayar</TableHead>
            <TableHead class="text-right">Dibuat</TableHead>
            <TableHead class="w-16 text-center">Aksi</TableHead>
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
              Tidak ada transaksi.
            </TableCell>
          </TableRow>
          <TableRow
            v-for="tx in items"
            :key="tx.transactionId"
            class="cursor-pointer"
          >
            <TableCell>
              <RouterLink
                :to="`/transactions/${tx.transactionId}`"
                class="block"
              >
                <div class="font-medium text-sm">{{ tx.referenceId }}</div>
                <div class="text-[11px] text-base-content/60 font-mono mt-0.5">
                  {{ shortId(tx.transactionId) }}
                </div>
              </RouterLink>
            </TableCell>
            <TableCell>
              <RouterLink :to="`/transactions/${tx.transactionId}`" class="text-sm">
                {{ tx.merchantName ?? "—" }}
              </RouterLink>
            </TableCell>
            <TableCell class="text-right font-mono tabular-nums text-sm">
              {{ formatIDR(tx.totalAmount) }}
            </TableCell>
            <TableCell>
              <RouterLink :to="`/transactions/${tx.transactionId}`">
                <StatusBadge :status="tx.status" />
              </RouterLink>
            </TableCell>
            <TableCell class="text-right text-xs text-base-content/60 font-mono">
              {{ tx.paidAt ? formatDateTime(tx.paidAt) : "—" }}
            </TableCell>
            <TableCell class="text-right text-xs text-base-content/60 font-mono">
              {{ formatDateTime(tx.createdAt) }}
            </TableCell>
            <TableCell class="text-center">
              <Button
                variant="ghost"
                size="sm"
                :disabled="deleting === tx.transactionId"
                @click.stop="confirmDelete(tx)"
                class="text-base-content/40 hover:text-error"
              >
                <Loader2 v-if="deleting === tx.transactionId" class="size-4 animate-spin" />
                <Trash2 v-else class="size-4" />
              </Button>
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
  </div>
</template>
