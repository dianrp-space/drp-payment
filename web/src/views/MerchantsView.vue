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
import type { Merchant, MerchantCreated, QrisMode } from "@/types";
import { useAlert } from "@/composables/useAlert";
import AlertFeedback from "@/components/AlertFeedback.vue";
import jsQR from "jsqr";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const merchants = ref<Merchant[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const dialogOpen = ref(false);
const creating = ref(false);
const createdMerchant = ref<MerchantCreated | null>(null);
const confirmOpen = ref(false);
const deleteTarget = ref<string | null>(null);

const form = ref({
  name: "",
  email: "",
  staticQris: "",
  qrisImageBase64: "",
  webhookUrl: "",
  qrisMode: "OTHERS" as QrisMode,
  useCustomGateway: false,
  gopayGatewayUrl: "",
  gopayGatewayApiKey: "",
});
const testingGopay = ref(false);
const qrisPreviewUrl = ref<string | null>(null);
const deleting = ref<string | null>(null);
const alert = useAlert();

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
  if (form.value.qrisMode === "GOPAY" && form.value.useCustomGateway) {
    if (!form.value.gopayGatewayUrl.trim() || !form.value.gopayGatewayApiKey.trim()) {
      toast.error("URL dan API key gateway Gopay wajib diisi untuk gateway sendiri");
      return;
    }
  }
  confirmOpen.value = true;
}

async function handleCreateConfirmed() {
  confirmOpen.value = false;
  creating.value = true;
  try {
    const res = await api.createMerchant({
      name: form.value.name.trim(),
      email: form.value.email.trim() || undefined,
      staticQris: form.value.staticQris.trim() || undefined,
      qrisImageBase64: form.value.qrisImageBase64 || undefined,
      webhookUrl: form.value.webhookUrl.trim() || undefined,
      qrisMode: form.value.qrisMode,
      ...(form.value.qrisMode === "GOPAY" && form.value.useCustomGateway
        ? {
            gopayGatewayUrl: form.value.gopayGatewayUrl.trim(),
            gopayGatewayApiKey: form.value.gopayGatewayApiKey.trim(),
          }
        : {}),
    });
    createdMerchant.value = {
      ...res.merchant,
      apiKey: res.merchant.apiKey!,
      webhookSecret: res.merchant.webhookSecret!,
      notice: res.merchant.notice!,
    };
    alert.show("Merchant berhasil dibuat");
    form.value = {
      name: "",
      email: "",
      staticQris: "",
      qrisImageBase64: "",
      webhookUrl: "",
      qrisMode: "OTHERS",
      useCustomGateway: false,
      gopayGatewayUrl: "",
      gopayGatewayApiKey: "",
    };
    clearQrisImage();
    await load();
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "Gagal membuat merchant";
    alert.show(msg, "error");
    toast.error(msg);
  } finally {
    creating.value = false;
  }
}

function handleDelete(id: string) {
  deleteTarget.value = id;
}

async function handleDeleteConfirmed() {
  const id = deleteTarget.value!;
  deleteTarget.value = null;
  deleting.value = id;
  try {
    await api.deleteMerchant(id);
    alert.show("Merchant berhasil dihapus");
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

async function testCreateGopay() {
  if (!form.value.gopayGatewayUrl.trim() || !form.value.gopayGatewayApiKey.trim()) {
    toast.error("Isi URL dan API key dulu");
    return;
  }
  testingGopay.value = true;
  try {
    const res = await api.testGopayConnection({
      url: form.value.gopayGatewayUrl.trim(),
      apiKey: form.value.gopayGatewayApiKey.trim(),
    });
    if (res.success) toast.success(res.message || "Koneksi Gopay berhasil");
    else toast.error(res.message || "Koneksi Gopay gagal");
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal tes koneksi");
  } finally {
    testingGopay.value = false;
  }
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
              <Label>Tipe QRIS</Label>
              <div class="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  :variant="form.qrisMode === 'OTHERS' ? 'default' : 'outline'"
                  :disabled="creating"
                  @click="form.qrisMode = 'OTHERS'"
                >
                  Others
                </Button>
                <Button
                  type="button"
                  size="sm"
                  :variant="form.qrisMode === 'GOPAY' ? 'default' : 'outline'"
                  :disabled="creating"
                  @click="form.qrisMode = 'GOPAY'"
                >
                  Gopay
                </Button>
              </div>
              <p class="text-[11px] text-base-content/60">
                Gopay: cek pembayaran via API GoBiz. Others: flow MacroDroid seperti biasa.
              </p>
            </div>

            <div v-if="form.qrisMode === 'GOPAY'" class="flex flex-col gap-3 rounded-md border border-base-300 p-3">
              <div class="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  :variant="!form.useCustomGateway ? 'default' : 'outline'"
                  :disabled="creating"
                  @click="form.useCustomGateway = false"
                >
                  Pakai gateway global
                </Button>
                <Button
                  type="button"
                  size="sm"
                  :variant="form.useCustomGateway ? 'default' : 'outline'"
                  :disabled="creating"
                  @click="form.useCustomGateway = true"
                >
                  Gateway sendiri
                </Button>
              </div>
              <template v-if="form.useCustomGateway">
                <div class="flex flex-col gap-1.5">
                  <Label for="m-gopay-url">URL gopay-qris</Label>
                  <Input
                    id="m-gopay-url"
                    v-model="form.gopayGatewayUrl"
                    placeholder="https://gopay.domainkamu.com"
                    :disabled="creating"
                    class="font-mono text-xs"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="m-gopay-key">API Key gateway</Label>
                  <Input
                    id="m-gopay-key"
                    v-model="form.gopayGatewayApiKey"
                    type="password"
                    placeholder="API_KEY dari .env gopay-qris"
                    :disabled="creating"
                    class="font-mono text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="self-start"
                  :disabled="creating || testingGopay"
                  @click="testCreateGopay"
                >
                  <Loader2 v-if="testingGopay" class="size-3.5 animate-spin" />
                  Test koneksi
                </Button>
              </template>
              <p v-else class="text-[11px] text-base-content/60">
                Menggunakan URL &amp; API key yang diisi di Pengaturan → Gopay Gateway.
              </p>
            </div>

            <div class="flex flex-col gap-1.5">
              <Label for="m-webhook">Webhook URL (opsional)</Label>
              <Input
                id="m-webhook"
                v-model="form.webhookUrl"
                type="text"
                placeholder="https://app.merchant.com/qris-callback"
                :disabled="creating"
              />
            </div>
          </form>

          <!-- Confirm dialog -->
          <AlertDialog :open="confirmOpen">
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Buat merchant baru?</AlertDialogTitle>
                <AlertDialogDescription>
                  Pastikan data merchant sudah benar. API key &amp; webhook secret akan dibuat otomatis.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button variant="ghost" @click="confirmOpen = false">Batal</Button>
                <Button @click="handleCreateConfirmed">Ya, buat</Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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

    <!-- Delete confirmation -->
    <AlertDialog :open="deleteTarget !== null">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus merchant?</AlertDialogTitle>
          <AlertDialogDescription>
            Semua transaksi merchant ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <Button variant="destructive" @click="handleDeleteConfirmed">
            Hapus
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertFeedback
      :type="alert.type.value"
      :visible="alert.visible.value"
      :message="alert.message.value"
      @dismiss="alert.dismiss"
    />

    <div v-if="error" class="text-error text-sm mb-6">{{ error }}</div>

    <Card class="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead>Merchant</TableHead>
            <TableHead>API Key</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tipe</TableHead>
            <TableHead class="text-right">Transaksi</TableHead>
            <TableHead class="text-right">Dibuat</TableHead>
            <TableHead class="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading && !merchants.length">
            <TableCell :colspan="7" class="text-center py-12 text-base-content/60">
              <Loader2 class="size-5 animate-spin inline-block" />
            </TableCell>
          </TableRow>
          <TableRow v-else-if="!merchants.length">
            <TableCell :colspan="7" class="text-center py-12 text-base-content/60">
              <Store class="size-6 mx-auto mb-2 opacity-50" />
              Belum ada merchant. Klik <strong>Merchant baru</strong>.
            </TableCell>
          </TableRow>
          <TableRow v-for="m in merchants" :key="m.id" class="cursor-pointer">
            <TableCell>
              <RouterLink :to="`/merchants/${m.id}`" class="flex items-center gap-3 min-w-0">
                <img
                  v-if="m.avatarPath"
                  :src="m.avatarPath"
                  :alt="m.name"
                  class="size-8 rounded-full object-cover shrink-0 bg-base-200"
                />
                <span
                  v-else
                  class="flex items-center justify-center size-8 rounded-full bg-primary/10 text-primary text-[11px] font-semibold shrink-0"
                >
                  {{
                    m.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0] || "")
                      .join("")
                      .toUpperCase() || "?"
                  }}
                </span>
                <span class="min-w-0">
                  <span class="font-medium text-sm block truncate">{{ m.name }}</span>
                  <span class="text-[11px] text-base-content/60 mt-0.5 block truncate">
                    {{ m.email ?? "—" }}
                  </span>
                </span>
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
            <TableCell>
              <RouterLink :to="`/merchants/${m.id}`" class="text-xs font-mono">
                {{ m.qrisMode === "GOPAY" ? "Gopay" : "Others" }}
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
