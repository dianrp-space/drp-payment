<script setup lang="ts">
import { useRoute } from "vue-router";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Store,
  Settings,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
  ScrollText,
} from "lucide-vue-next";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUiStore } from "@/stores/ui";
import { useBrandingStore } from "@/stores/branding";
import { RouterLink } from "vue-router";
import { computed } from "vue";

const ui = useUiStore();
const route = useRoute();
const branding = useBrandingStore();

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const nav: NavItem[] = [
  { to: "/", label: "Ringkasan", icon: LayoutDashboard },
  { to: "/transactions", label: "Transaksi", icon: ArrowLeftRight },
  { to: "/merchants", label: "Merchant", icon: Store },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText },
  { to: "/settings", label: "Pengaturan", icon: Settings },
  { to: "/api-docs", label: "API Docs", icon: BookOpen },
];

function isActive(to: string): boolean {
  if (to === "/") return route.path === "/";
  return route.path === to || route.path.startsWith(to + "/");
}

const asideClass = computed(() =>
  ui.sidebarCollapsed ? "w-[72px]" : "w-[200px]"
);
</script>

<template>
  <aside
    :class="[
      'hidden md:flex shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-border transition-[width] duration-200 ease-in-out',
      asideClass,
    ]"
  >
    <!-- Brand row -->
    <div
      :class="[
        'flex items-center border-b border-border h-14 shrink-0',
        ui.sidebarCollapsed ? 'justify-center px-2' : 'gap-2 px-4',
      ]"
    >
      <RouterLink
        to="/"
        class="flex items-center gap-2 min-w-0"
        :aria-label="branding.appName"
        :title="branding.appName"
      >
        <img
          v-if="branding.logoSrc"
          :src="branding.logoSrc"
          alt="logo"
          class="h-8 w-8 object-contain shrink-0"
        />
        <span
          v-else
          class="flex items-center justify-center size-8 rounded-md bg-primary/10 text-primary shrink-0"
        >
          <QrCode class="size-4" />
        </span>
        <span
          v-if="!ui.sidebarCollapsed"
          class="font-display text-lg italic text-primary truncate min-w-0 leading-tight"
        >
          {{ branding.appName }}
        </span>
      </RouterLink>
    </div>

    <nav class="flex-1 px-3 py-4 flex flex-col gap-1">
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        :class="[
          'flex items-center gap-3 rounded-md text-sm transition-colors',
          ui.sidebarCollapsed ? 'justify-center px-2 py-2' : 'px-3 py-2',
          isActive(item.to)
            ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        ]"
        :title="ui.sidebarCollapsed ? item.label : undefined"
      >
        <component :is="item.icon" class="size-4 shrink-0" />
        <span v-if="!ui.sidebarCollapsed">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <!-- Collapse toggle (bottom) -->
    <div
      class="border-t border-border p-2 flex"
      :class="ui.sidebarCollapsed ? 'justify-center' : 'justify-end'"
    >
      <Button
        variant="ghost"
        size="icon"
        class="size-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        @click="ui.toggleSidebarCollapsed()"
        :aria-label="ui.sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'"
        :title="ui.sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'"
      >
        <PanelLeftClose v-if="!ui.sidebarCollapsed" class="size-4" />
        <PanelLeftOpen v-else class="size-4" />
      </Button>
    </div>
  </aside>

  <!-- Mobile sheet -->
  <Sheet v-model:open="ui.sidebarOpen">
    <SheetContent side="left" class="w-[260px] p-0">
      <SheetHeader class="px-6 py-7">
        <SheetTitle class="flex items-center gap-2">
          <img
            v-if="branding.logoSrc"
            :src="branding.logoSrc"
            alt="logo"
            class="h-8 w-8 object-contain shrink-0"
          />
          <span
            v-else
            class="flex items-center justify-center size-8 rounded-md bg-primary/10 text-primary shrink-0"
          >
            <QrCode class="size-4" />
          </span>
          <span class="font-display text-2xl italic text-primary truncate">
            {{ branding.appName }}
          </span>
        </SheetTitle>
      </SheetHeader>
      <Separator />
      <nav class="px-3 py-5 flex flex-col gap-1">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 px-3 py-2 rounded-md text-sm"
          :class="
            isActive(item.to)
              ? 'bg-primary text-primary-foreground font-medium'
              : 'hover:bg-sidebar-accent'
          "
          @click="ui.closeSidebar()"
        >
          <component :is="item.icon" class="size-4" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </SheetContent>
  </Sheet>
</template>