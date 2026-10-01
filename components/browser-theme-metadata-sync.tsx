"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { syncBrowserThemeMetadata } from "@/lib/theme/browser-theme";
import { resolveCurrentThemeAttribute } from "@/lib/theme/theme";

export default function BrowserThemeMetadataSync() {
  const pathname = usePathname();

  useEffect(() => {
    syncBrowserThemeMetadata(resolveCurrentThemeAttribute());
  }, [pathname]);

  return null;
}
