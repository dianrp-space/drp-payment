<script setup lang="ts">
import { ref, computed } from "vue";
import { toast } from "vue-sonner";
import { Copy, AlertTriangle, Check } from "lucide-vue-next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/utils";
import { useBrandingStore } from "@/stores/branding";
import type { MerchantCreated } from "@/types";

const props = defineProps<{ merchant: MerchantCreated }>();
const branding = useBrandingStore();

const copied = ref({ apiKey: false, secret: false, callbackUrl: false });

async function copy(field: "apiKey" | "secret" | "callbackUrl") {
  let value;
  if (field === "apiKey") value = props.merchant.apiKey;
  else if (field === "secret") value = props.merchant.webhookSecret;
  else value = callbackUrl.value;
  const ok = await copyToClipboard(value);
  if (ok) {
    copied.value[field] = true;
    toast.success("Disalin");
    setTimeout(() => (copied.value[field] = false), 2000);
  } else {
    toast.error("Gagal menyalin");
  }
}

const callbackUrl = computed(() =>
  props.merchant.callbackToken
    ? branding.url(`/v2/callback/${props.merchant.id}`)
    : ""
);
</script>

<template>
  <Alert variant="destructive" class="mb-4">
    <AlertTriangle class="size-4" />
    <AlertTitle>Tampilkan sekali saja</AlertTitle>
    <AlertDescription>
      Simpan API key &amp; webhook secret sekarang. Tutup dialog ini dan data
      hilang dari tampilan.
    </AlertDescription>
  </Alert>

  <div class="space-y-3">
    <div>
      <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-1">
        API Key
      </p>
      <div class="flex items-center gap-2">
        <code class="flex-1 font-mono text-xs bg-base-200/40 border border-base-300 rounded px-2 py-1.5 break-all">
          {{ merchant.apiKey }}
        </code>
        <Button size="sm" variant="outline" @click="copy('apiKey')">
          <component :is="copied.apiKey ? Check : Copy" class="size-3.5" />
        </Button>
      </div>
    </div>

    <div>
      <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-1">
        Webhook Secret
      </p>
      <div class="flex items-center gap-2">
        <code class="flex-1 font-mono text-xs bg-base-200/40 border border-base-300 rounded px-2 py-1.5 break-all">
          {{ merchant.webhookSecret }}
        </code>
        <Button size="sm" variant="outline" @click="copy('secret')">
          <component :is="copied.secret ? Check : Copy" class="size-3.5" />
        </Button>
      </div>
    </div>

    <div v-if="merchant.callbackToken" class="rounded-md border border-base-300 bg-base-200/20 p-3">
      <p class="text-[11px] uppercase tracking-wider text-base-content/60 mb-1">
        URL Callback Macrodroid
      </p>
      <div class="flex items-center gap-2">
        <code class="flex-1 font-mono text-[11px] bg-base-100 border border-base-300 rounded px-2 py-1.5 break-all">
          {{ callbackUrl }}
        </code>
        <Button size="sm" variant="outline" @click="copy('callbackUrl')">
          <component :is="copied.callbackUrl ? Check : Copy" class="size-3.5" />
        </Button>
      </div>
    </div>

    <div class="pt-2 text-[11px] text-base-content/60">
      Hint untuk dashboard: <span class="font-mono">{{ merchant.apiKeyHint }}</span>
    </div>
  </div>
</template>
