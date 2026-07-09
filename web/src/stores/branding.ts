import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "@/lib/api";
import type { Branding } from "@/types";

const DEFAULT_APP_NAME = "DRP Payment Gateway";
const DEFAULT_APP_URL =
  typeof window !== "undefined"
    ? (import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8081")
    : "http://localhost:8081";
const DEFAULT_LOGO_SRC = "/drp-payment.webp";
const DEFAULT_FAVICON_HREF = "/drp-payment.webp";

function applyFavicon(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

export const useBrandingStore = defineStore("branding", () => {
  const appName = ref(DEFAULT_APP_NAME);
  const appLogoBase64 = ref<string | null>(null);
  const faviconBase64 = ref<string | null>(null);
  const appUrl = ref(DEFAULT_APP_URL);
  const loaded = ref(false);
  const loading = ref(false);

  const logoSrc = computed<string>(() => appLogoBase64.value ?? DEFAULT_LOGO_SRC);
  const faviconHref = computed<string>(() =>
    faviconBase64.value ?? DEFAULT_FAVICON_HREF
  );

  function applyAll(): void {
    applyFavicon(faviconHref.value);
  }

  async function load(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    try {
      const res = await api.getBranding();
      appName.value = res.branding.appName || DEFAULT_APP_NAME;
      appLogoBase64.value = res.branding.appLogoBase64;
      faviconBase64.value = res.branding.faviconBase64;
      appUrl.value = (res.branding.appUrl || DEFAULT_APP_URL).replace(/\/+$/, "");
      loaded.value = true;
      applyAll();
    } catch {
      // Fall back to defaults silently (e.g. backend offline on login page)
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  function hydrate(b: Branding): void {
    appName.value = b.appName || DEFAULT_APP_NAME;
    appLogoBase64.value = b.appLogoBase64;
    faviconBase64.value = b.faviconBase64;
    appUrl.value = (b.appUrl || DEFAULT_APP_URL).replace(/\/+$/, "");
    applyAll();
  }

  /** Build absolute URL untuk path di gateway (mis. callback endpoint). */
  function url(path: string): string {
    const base = appUrl.value.replace(/\/+$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
  }

  return {
    appName,
    appLogoBase64,
    faviconBase64,
    appUrl,
    logoSrc,
    faviconHref,
    loaded,
    loading,
    load,
    hydrate,
    url,
  };
});
