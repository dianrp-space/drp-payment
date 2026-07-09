<script setup lang="ts">
import { ref, onMounted } from "vue";
import { RouterLink } from "vue-router";
import {
  Plus, Loader2, Store, Upload, X, Trash2,
} from "@lucide/vue";
import { toast } from "vue-sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/StatusBadge.vue";
import MerchantCreateResult from "@/components/MerchantCreateResult.vue";
import { api, HttpError } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { Merchant, MerchantCreated } from "@/types";
import Swal from "sweetalert2";
import jsQR from "jsqr";

const merchants = ref<Merchant[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const dialogOpen = ref(false);
const creating = ref(false);
const createdMerchant = ref<MerchantCreated | null>(null);

const form = ref({
  name: "",
  email: "",
  staticQris: "",
  qrisImageBase64: "",
  webhookUrl: "",
});
const qrisPreviewUrl = ref<string | null>(null);
const deleting = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await api.listMerchants();
    merchants.value = res.merchants;
  } catch (e) {
    error.value = e instanceof HttpError ? e.message : "Gagal memuat merchant";
  } finally {
    loading.value = false;
  }
}

function handleQrisFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (qrisPreviewUrl.value) {
    URL.revokeObjectURL(qrisPreviewUrl.value);
  }
  qrisPreviewUrl.value = URL.createObjectURL(file);

  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result as string;
    form.value.qrisImageBase64 = base64;

    // Parse QR client-side
    const parsed = await parseQrFromBase64(base64);
    if (parsed) {
      form.value.staticQris = parsed;
    }
  };
  reader.readAsDataURL(file);
}

async function parseQrFromBase64(base64: string): Promise<string | null> {
  try {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Gagal memuat gambar"));
      img.src = base64;
    });

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (!code) {
      toast.warning("Tidak dapat membaca QR code dari gambar");
      return null;
    }
    toast.success("QRIS berhasil diparse");
    return code.data;
  } catch {
    toast.error("Gagal memproses gambar");
    return null;
  }
}

function clearQrisImage() {
  form.value.qrisImageBase64 = "";
  if (qrisPreviewUrl.value) {
    URL.revokeObjectURL(qrisPreviewUrl.value);
    qrisPreviewUrl.value = null;
  }
}

async function handleCreate() {
  if (!form.value.name.trim()) {
    toast.error("Nama merchant wajib diisi");
    return;
  }
  if (!form.value.staticQris.trim() && !form.value.qrisImageBase64) {
    toast.error("Upload gambar QRIS atau masukkan string QRIS manual");
    return;
  }
  const confirmed = await Swal.fire({
    title: "Buat merchant baru?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, buat",
    cancelButtonText: "Batal",
    reverseButtons: true,
  });
  if (!confirmed.isConfirmed) return;
  creating.value = true;
  try {
    const res = await api.createMerchant({
      name: form.value.name.trim(),
      email: form.value.email.trim() || undefined,
      staticQris: form.value.staticQris.trim() || undefined,
      qrisImageBase64: form.value.qrisImageBase64 || undefined,
      webhookUrl: form.value.webhookUrl.trim() || undefined,
    });
    createdMerchant.value = {
      ...res.merchant,
      apiKey: res.merchant.apiKey!,
      webhookSecret: res.merchant.webhookSecret!,
      notice: res.merchant.notice!,
    };
    toast.success("Merchant dibuat");
    form.value = { name: "", email: "", staticQris: "", qrisImageBase64: "", webhookUrl: "" };
    clearQrisImage();
    await load();
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "Gagal membuat merchant";
    toast.error(msg);
  } finally {
    creating.value = false;
  }
}

async function handleDelete(id: string) {
  const result = await Swal.fire({
    title: "Hapus merchant?",
    text: "Semua transaksi merchant ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Hapus",
    cancelButtonText: "Batal",
    confirmButtonColor: "#dc2626",
    reverseButtons: true,
  });
  if (!result.isConfirmed) return;
  deleting.value = id;
  try {
    await api.deleteMerchant(id);
    toast.success("Merchant dihapus");
    await load();
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal menghapus merchant");
  } finally {
    deleting.value = null;
  }
}

function closeDialog() {
  dialogOpen.value = false;
  createdMerchant.value = null;
}

onMounted(load);
</script>

<template>
  <div class="p-6 md:p-10 max-w-6xl mx-auto">
    <header class="mb-8 flex items-end justify-between gap-4">
      <div>
        <p class="text-[11px] uppercase tracking-[0.15em] text-base-content/60 mb-2">
          Tenant
        </p>
        <h1 class="font-display text-4xl italic">Merchant</h1>
        <p class="text-sm text-base-content/60 mt-2">
          Tiap merchant punya API key &amp; webhook secret sendiri.
        </p>
      </div>

      <Dialog v-model:open="dialogOpen">
        <DialogTrigger as-child>
          <Button>
            <Plus class="size-4" /> Merchant baru
          </Button>
        </DialogTrigger>
        <DialogContent class="max-w-lg">
          <DialogHeader>
            <DialogTitle class="font-display text-2xl italic">Merchant baru</DialogTitle>
            <DialogDescription>
              Masukkan data merchant. API key &amp; webhook secret akan dibuat otomatis.
            </DialogDescription>
          </DialogHeader>

          <!-- Result view (after create) -->
          <MerchantCreateResult
            v-if="createdMerchant"
            :merchant="createdMerchant"
          />

          <!-- Form -->
          <form v-else @submit.prevent="handleCreate" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <Label for="m-name">Nama merchant</Label>
              <Input id="m-name" v-model="form.name" placeholder="Toko Kopi Senja" :disabled="creating" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="m-email">Email (opsional)</Label>
              <Input id="m-email" v-model="form.email" type="email" placeholder="hi@toko.id" :disabled="creating" />
            </div>

            <!-- QRIS image upload -->
            <div class="flex flex-col gap-1.5">
              <Label>QRIS merchant</Label>
              <div v-if="!qrisPreviewUrl" class="flex gap-2">
                <label
                  class="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-base-300 rounded-md px-4 py-6 cursor-pointer hover:border-primary/50 transition-colors text-base-content/60 text-sm"
                  :class="{ 'opacity-50 pointer-events-none': creating }"
                >
                  <Upload class="size-4" />
                  <span>Upload gambar QRIS</span>
                  <input
                    type="file"
                    accept="image/*"
                    class="sr-only"
                    :disabled="creating"
                    @change="handleQrisFile"
                  />
                </label>
                <span class="self-center text-xs text-base-content/60">atau</span>
              </div>
              <div v-if="qrisPreviewUrl" class="relative inline-flex">
                <img
                  :src="qrisPreviewUrl"
                  class="h-32 w-32 object-cover rounded-md border border-base-300"
                  alt="QRIS preview"
                />
                <button
                  type="button"
                  class="absolute -top-2 -right-2 bg-base-100 border border-base-300 rounded-full p-0.5 shadow-sm hover:bg-base-300 transition-colors"
                  :disabled="creating"
                  @click="clearQrisImage"
                >
                  <X class="size-3.5" />
                </button>
              </div>
              <Textarea
                v-model="form.staticQris"
                placeholder="Atau tempel string QRIS langsung..."
                class="font-mono text-xs min-h-20"
                :disabled="creating"
                style="field-sizing: fixed; max-width: 100%; width: 100%"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <Label for="m-webhook">Webhook URL (opsional)</Label>
              <Input
                id="m-webhook"
                v-model="form.webhookUrl"
                type="url"
                placeholder="https://app.merchant.com/qris-callback"
                :disabled="creating"
              />
            </div>
          </form>

          <DialogFooter v-if="!createdMerchant">
            <DialogClose as-child>
              <Button type="button" variant="ghost" :disabled="creating">Batal</Button>
            </DialogClose>
            <Button type="button" @click="handleCreate" :disabled="creating">
              <Loader2 v-if="creating" class="size-4 animate-spin" />
              <span v-else>Buat</span>
            </Button>
          </DialogFooter>
          <DialogFooter v-else>
            <Button type="button" @click="closeDialog">Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>

    <div v-if="error" class="text-error text-sm mb-6">{{ error }}</div>

    <Card class="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead>Merchant</TableHead>
            <TableHead>API Key</TableHead>
            <TableHead>Status</TableHead>
            <TableHead class="text-right">Transaksi</TableHead>
            <TableHead class="text-right">Dibuat</TableHead>
            <TableHead class="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading && !merchants.length">
            <TableCell :colspan="6" class="text-center py-12 text-base-content/60">
              <Loader2 class="size-5 animate-spin inline-block" />
            </TableCell>
          </TableRow>
          <TableRow v-else-if="!merchants.length">
            <TableCell :colspan="6" class="text-center py-12 text-base-content/60">
              <Store class="size-6 mx-auto mb-2 opacity-50" />
              Belum ada merchant. Klik <strong>Merchant baru</strong>.
            </TableCell>
          </TableRow>
          <TableRow v-for="m in merchants" :key="m.id" class="cursor-pointer">
            <TableCell>
              <RouterLink :to="`/merchants/${m.id}`" class="block">
                <div class="font-medium text-sm">{{ m.name }}</div>
                <div class="text-[11px] text-base-content/60 mt-0.5">
                  {{ m.email ?? "—" }}
                </div>
              </RouterLink>
            </TableCell>
            <TableCell>
              <RouterLink :to="`/merchants/${m.id}`" class="font-mono text-xs">
                {{ m.apiKeyHint }}
              </RouterLink>
            </TableCell>
            <TableCell>
              <RouterLink :to="`/merchants/${m.id}`">
                <StatusBadge :status="m.status" />
              </RouterLink>
            </TableCell>
            <TableCell class="text-right font-mono tabular-nums text-sm">
              {{ m._count?.transactions ?? 0 }}
            </TableCell>
            <TableCell class="text-right text-xs text-base-content/60 font-mono">
              {{ formatDateTime(m.createdAt) }}
            </TableCell>
            <TableCell class="text-right">
              <Button
                variant="ghost"
                size="sm"
                class="text-base-content/60 hover:text-error"
                :disabled="deleting === m.id"
                @click="handleDelete(m.id)"
              >
                <Loader2 v-if="deleting === m.id" class="size-3.5 animate-spin" />
                <Trash2 v-else class="size-3.5" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  </div>
</template>
