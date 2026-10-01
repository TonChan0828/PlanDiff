"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { syncBrowserThemeMetadata } from "@/lib/theme/browser-theme";
import { resolveCurrentThemeAttribute } from "@/lib/theme/theme";

export default function BrowserThemeMetadataSync() {
  const pathname = usePathname();

  useEffect(() => {
    const sync = () => syncBrowserThemeMetadata(resolveCurrentThemeAttribute());

    sync();

    // 動的ページではNext.jsがUIの後にmetadataをstreamingすることがある。
    // 後から追加・置換されたタグにも現在のテーマを反映する。
    const observer = new MutationObserver((mutations) => {
      const needsSync = mutations.some((mutation) => {
        if (mutation.type === "attributes") {
          const target = mutation.target;
          return (
            (target instanceof HTMLMetaElement &&
              target.name === "theme-color") ||
            (target instanceof HTMLLinkElement &&
              target.relList.contains("icon"))
          );
        }

        const isThemeMetadata = (node: Node) => {
          if (!(node instanceof Element)) return false;
          return (
            node.matches('meta[name="theme-color"], link[rel~="icon"]') ||
            node.querySelector(
              'meta[name="theme-color"], link[rel~="icon"]',
            ) !== null
          );
        };

        return (
          mutation.target === document.head ||
          Array.from(mutation.addedNodes).some(isThemeMetadata) ||
          Array.from(mutation.removedNodes).some(isThemeMetadata)
        );
      });

      if (needsSync) sync();
    });

    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["content", "href", "media", "name", "rel"],
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
