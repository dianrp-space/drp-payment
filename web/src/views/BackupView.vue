<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  Download,
  Trash2,
  RotateCcw,
  Plus,
  Loader2,
  Database,
} from "@lucide/vue";
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
import { Button } from "@/components/ui/button";
import { api, HttpError } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { BackupFile } from "@/types";

const backups = ref<BackupFile[]>([]);
const loading = ref(false);
const creating = ref(false);
const error = ref<string | null>(null);
const restoring = ref<string | null>(null);
const deleting = ref<string | null>(null);

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await api.listBackups();
    backups.value = res.backups;
  } catch (e) {
    error.value = e instanceof HttpError ? e.message : "Gagal memuat daftar backup";
  } finally {
    loading.value = false;
  }
}

async function createBackup() {
  creating.value = true;
  try {
    const res = await api.createBackup();
    await Swal.fire({
      title: "Backup berhasil!",
      html: `File: <code class="text-xs">${res.filename}</code><br>
      Ukuran: <strong>${formatBytes(res.size)}</strong>`,
      icon: "success",
      confirmButtonText: "OK",
    });
    await load();
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "Gagal membuat backup";
    await Swal.fire({
      title: "Backup gagal",
      text: msg,
      icon: "error",
      confirmButtonText: "Tutup",
    });
  } finally {
    creating.value = false;
  }
}

async function confirmDelete(f: BackupFile) {
  const result = await Swal.fire({
    title: "Hapus backup?",
    text: `${f.filename} akan dihapus permanen.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Hapus",
    cancelButtonText: "Batal",
    confirmButtonColor: "#dc2626",
  });
  if (!result.isConfirmed) return;

  deleting.value = f.filename;
  try {
    await api.deleteBackup(f.filename);
    toast.success("Backup dihapus");
    await load();
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "Gagal menghapus backup";
    await Swal.fire({
      title: "Gagal menghapus",
      text: msg,
      icon: "error",
      confirmButtonText: "Tutup",
    });
  } finally {
    deleting.value = null;
  }
}

async function confirmRestore(f: BackupFile) {
  const result = await Swal.fire({
    title: "Restore database?",
    html: `Data <strong>saat ini akan diganti</strong> dengan isi backup<br>
    <code class="text-xs">${f.filename}</code><br><br>
    <span class="text-warning">Tindakan ini tidak bisa dibatalkan!</span>`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Restore",
    cancelButtonText: "Batal",
    confirmButtonColor: "#d97706",
  });
  if (!result.isConfirmed) return;

  restoring.value = f.filename;
  try {
    await api.restoreBackup(f.filename);
    await Swal.fire({
      title: "Restore berhasil!",
      text: `Database telah dikembalikan ke isi backup ${f.filename}`,
      icon: "success",
      confirmButtonText: "OK",
    });
    await load();
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "Gagal merestore backup";
    await Swal.fire({
      title: "Restore gagal",
      text: msg,
      icon: "error",
      confirmButtonText: "Tutup",
    });
  } finally {
    restoring.value = null;
  }
}

function download(filename: string) {
  const token = localStorage.getItem("drp-admin-token");
  const url = `/admin/backups/${encodeURIComponent(filename)}`;
  const a = document.createElement("a");
  a.href = url;
  if (token) {
    // Use fetch with auth header to trigger download
    fetch(url, { headers: { "X-Admin-Token": token ?? "" } })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => toast.error("Gagal mengunduh backup"));
  }
}

onMounted(load);
</script>

<template>
  <div class="p-6 md:p-10 max-w-7xl mx-auto">
    <header class="mb-8 flex items-end justify-between gap-4">
      <div>
        <p class="text-[11px] uppercase tracking-[0.15em] text-base-content/60 mb-2">
          Database
        </p>
        <h1 class="font-display text-4xl italic">Backup &amp; Restore</h1>
        <p class="text-sm text-base-content/60 mt-2">
          Kelola backup database PostgreSQL
        </p>
      </div>
      <Button
        :disabled="creating"
        @click="createBackup"
      >
        <Loader2 v-if="creating" class="size-4 mr-2 animate-spin" />
        <Plus v-else class="size-4 mr-2" />
        Buat Backup
      </Button>
    </header>

    <!-- Error -->
    <div
      v-if="error"
      class="alert alert-error text-sm mb-6"
    >
      {{ error }}
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="flex items-center justify-center py-24">
      <Loader2 class="size-6 animate-spin text-base-content/40" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="backups.length === 0"
      class="flex flex-col items-center justify-center py-24 text-base-content/40"
    >
      <Database class="size-12 mb-4" />
      <p class="text-sm">Belum ada backup</p>
      <p class="text-xs mt-1">Klik "Buat Backup" untuk membuat backup pertama</p>
    </div>

    <!-- Table -->
    <div v-else class="rounded-box border border-base-300 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nama File</TableHead>
            <TableHead class="w-24 text-right">Ukuran</TableHead>
            <TableHead class="w-44">Dibuat</TableHead>
            <TableHead class="w-36 text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="f in backups" :key="f.filename">
            <TableCell class="font-mono text-xs truncate max-w-xs">
              {{ f.filename }}
            </TableCell>
            <TableCell class="text-right text-sm">
              {{ formatBytes(f.size) }}
            </TableCell>
            <TableCell class="text-sm">
              {{ formatDateTime(f.createdAt) }}
            </TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8"
                  title="Download"
                  @click="download(f.filename)"
                >
                  <Download class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-warning"
                  title="Restore"
                  :disabled="restoring === f.filename"
                  @click="confirmRestore(f)"
                >
                  <Loader2 v-if="restoring === f.filename" class="size-4 animate-spin" />
                  <RotateCcw v-else class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-error"
                  title="Hapus"
                  :disabled="deleting === f.filename"
                  @click="confirmDelete(f)"
                >
                  <Loader2 v-if="deleting === f.filename" class="size-4 animate-spin" />
                  <Trash2 v-else class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
