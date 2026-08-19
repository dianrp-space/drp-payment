<script setup lang="ts">
import { ref, onMounted } from "vue";
import { toast } from "vue-sonner";
import { Loader2, Save, Plug } from "@lucide/vue";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api, HttpError } from "@/lib/api";
import GopayLoginConsole from "@/components/GopayLoginConsole.vue";

const gopayUrl = ref("");
const gopayApiKey = ref("");
const gopayHasKey = ref(false);
const gopayHint = ref<string | null>(null);
const savingGopay = ref(false);
const testingGopay = ref(false);

async function loadGopaySettings() {
  try {
    const res = await api.getGopayGatewaySettings();
    gopayUrl.value = res.settings.gopayGatewayUrl ?? "";
    gopayHasKey.value = res.settings.hasGopayGatewayApiKey;
    gopayHint.value = res.settings.gopayGatewayApiKeyHint;
    gopayApiKey.value = "";
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal memuat setting Gopay");
  }
}

async function saveGopaySettings() {
  savingGopay.value = true;
  try {
    const body: { gopayGatewayUrl?: string | null; gopayGatewayApiKey?: string | null } = {
      gopayGatewayUrl: gopayUrl.value.trim() || null,
    };
    if (gopayApiKey.value.trim()) body.gopayGatewayApiKey = gopayApiKey.value.trim();
    if (!gopayUrl.value.trim()) body.gopayGatewayApiKey = null;
    const res = await api.updateGopayGatewaySettings(body);
    gopayUrl.value = res.settings.gopayGatewayUrl ?? "";
    gopayHasKey.value = res.settings.hasGopayGatewayApiKey;
    gopayHint.value = res.settings.gopayGatewayApiKeyHint;
    gopayApiKey.value = "";
    toast.success("Setting Gopay disimpan");
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal menyimpan setting Gopay");
  } finally {
    savingGopay.value = false;
  }
}

async function testGlobalGopay() {
  testingGopay.value = true;
  try {
    const body =
      gopayUrl.value.trim() && gopayApiKey.value.trim()
        ? { url: gopayUrl.value.trim(), apiKey: gopayApiKey.value.trim() }
        : {};
    const res = await api.testGopayConnection(body);
    if (res.success) toast.success(res.message || "Koneksi Gopay berhasil");
    else toast.error(res.message || "Koneksi Gopay gagal");
  } catch (e) {
    toast.error(e instanceof HttpError ? e.message : "Gagal tes koneksi");
  } finally {
    testingGopay.value = false;
  }
}

onMounted(loadGopaySettings);
</script>

<template>
  <div class="p-6 md:p-10 max-w-3xl mx-auto">
    <header class="mb-8">
      <p class="text-[11px] uppercase tracking-[0.15em] text-base-content/60 mb-2">
        Sistem
      </p>
      <h1 class="font-display text-4xl italic">Integrasi</h1>
      <p class="text-sm text-base-content/60 mt-2">
        Hubungkan layanan pihak ketiga untuk verifikasi pembayaran.
      </p>
    </header>

    <Card class="p-6">
      <div class="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 class="font-display text-2xl italic">Gopay Gateway (Global)</h2>
          <p class="text-xs text-base-content/60 mt-1">
            Instance gopay-qris default. Merchant Gopay tanpa URL sendiri memakai setting ini.
          </p>
        </div>
      </div>
      <Separator class="mb-5" />

      <form @submit.prevent="saveGopaySettings" class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label for="gopay-url" class="text-xs uppercase tracking-wider">URL gateway</Label>
          <Input
            id="gopay-url"
            v-model="gopayUrl"
            placeholder="https://gopay.domainkamu.com"
            class="font-mono text-xs"
            :disabled="savingGopay"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="gopay-key" class="text-xs uppercase tracking-wider">API Key</Label>
          <Input
            id="gopay-key"
            v-model="gopayApiKey"
            type="password"
            :placeholder="gopayHasKey ? `Tersimpan ${gopayHint ?? ''} — isi untuk ganti` : 'API_KEY dari .env gopay-qris'"
            class="font-mono text-xs"
            :disabled="savingGopay"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <Button type="submit" :disabled="savingGopay">
            <Loader2 v-if="savingGopay" class="size-4 animate-spin" />
            <Save v-else class="size-4" />
            Simpan
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="testingGopay"
            @click="testGlobalGopay"
          >
            <Loader2 v-if="testingGopay" class="size-4 animate-spin" />
            <Plug v-else class="size-4" />
            Test koneksi
          </Button>
        </div>
      </form>

      <Separator class="my-5" />
      <GopayLoginConsole />
    </Card>
  </div>
</template>
