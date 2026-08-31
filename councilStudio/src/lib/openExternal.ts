import { useAppStore } from "@/stores/appStore";

/**
 * Stage an external URL in the store for the confirmation dialog
 * (`ExternalLinkDialog`). Non-http(s) URLs (`file:`, `javascript:`, `data:`,
 * …) are dropped so they stay inert.
 */
export function confirmOpenExternal(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  useAppStore.getState().setPendingExternalUrl(url);
}
