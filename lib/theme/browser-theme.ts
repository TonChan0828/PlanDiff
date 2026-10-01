import {
  BRAND_COLOR,
  DARK_BACKGROUND_COLOR,
  STRUCTURED_BACKGROUND_COLOR,
} from "@/lib/pwa/theme";
import type { ThemeAttribute } from "@/lib/theme/theme";

export const BROWSER_THEME_DISPLAY: Readonly<
  Record<ThemeAttribute, { themeColor: string; iconHref: string }>
> = {
  light: { themeColor: BRAND_COLOR, iconHref: "/icons/favicon-light.svg" },
  dark: {
    themeColor: DARK_BACKGROUND_COLOR,
    iconHref: "/icons/favicon-dark.svg",
  },
  structured: {
    themeColor: STRUCTURED_BACKGROUND_COLOR,
    iconHref: "/icons/favicon-structured.svg",
  },
};

const SYSTEM_THEME_COLOR_BY_MEDIA: Readonly<Record<string, string>> = {
  "(prefers-color-scheme: light)": BRAND_COLOR,
  "(prefers-color-scheme: dark)": DARK_BACKGROUND_COLOR,
};

const originalThemeColors = new WeakMap<HTMLMetaElement, string | null>();
const originalIconHrefs = new WeakMap<HTMLLinkElement, string | null>();

/** Return the browser chrome values for a manually selected theme. */
export function resolveBrowserThemeDisplay(theme: ThemeAttribute) {
  return BROWSER_THEME_DISPLAY[theme];
}

/** Synchronize Next.js's existing metadata nodes without changing their identity. */
export function syncBrowserThemeMetadata(
  theme: ThemeAttribute | null,
  documentRef: Document | undefined = typeof document === "undefined"
    ? undefined
    : document,
): void {
  if (!documentRef) return;

  const display = theme ? resolveBrowserThemeDisplay(theme) : null;
  documentRef
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      if (display) {
        if (!originalThemeColors.has(meta)) {
          originalThemeColors.set(meta, meta.getAttribute("content"));
        }
        if (meta.getAttribute("content") !== display.themeColor) {
          meta.setAttribute("content", display.themeColor);
        }
        return;
      }

      const originalColor = originalThemeColors.get(meta);
      const media = meta.getAttribute("media");
      const systemColor =
        originalColor ?? (media ? SYSTEM_THEME_COLOR_BY_MEDIA[media] : null);
      if (systemColor && meta.getAttribute("content") !== systemColor) {
        meta.setAttribute("content", systemColor);
      }
      originalThemeColors.delete(meta);
    });

  documentRef
    .querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
    .forEach((icon) => {
      if (display) {
        if (!originalIconHrefs.has(icon)) {
          originalIconHrefs.set(icon, icon.getAttribute("href"));
        }
        if (icon.getAttribute("href") !== display.iconHref) {
          icon.setAttribute("href", display.iconHref);
        }
        return;
      }

      if (originalIconHrefs.has(icon)) {
        const originalHref = originalIconHrefs.get(icon);
        if (originalHref === null) {
          icon.removeAttribute("href");
        } else if (originalHref !== undefined) {
          icon.setAttribute("href", originalHref);
        }
        originalIconHrefs.delete(icon);
      }
    });
}
