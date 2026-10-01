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

const SYSTEM_COLOR_ATTRIBUTE = "data-plandiff-system-color";
const SYSTEM_MEDIA_ATTRIBUTE = "data-plandiff-system-media";
const SYSTEM_MEDIA_PRESENT_ATTRIBUTE = "data-plandiff-system-media-present";
const SYSTEM_ICON_ATTRIBUTE = "data-plandiff-system-icon-href";

/** Return the browser chrome values for a manually selected theme. */
export function resolveBrowserThemeDisplay(theme: ThemeAttribute) {
  return BROWSER_THEME_DISPLAY[theme];
}

/** Synchronize the existing Next.js metadata nodes without adding competing tags. */
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
    .forEach((meta, index) => {
      if (display) {
        if (!meta.hasAttribute(SYSTEM_COLOR_ATTRIBUTE)) {
          const systemColor = meta.getAttribute("content");
          if (systemColor !== null) {
            meta.setAttribute(SYSTEM_COLOR_ATTRIBUTE, systemColor);
          }
          const systemMedia = meta.getAttribute("media");
          meta.setAttribute(
            SYSTEM_MEDIA_PRESENT_ATTRIBUTE,
            systemMedia === null ? "false" : "true",
          );
          if (systemMedia !== null) {
            meta.setAttribute(SYSTEM_MEDIA_ATTRIBUTE, systemMedia);
          }
        }
        meta.setAttribute("content", display.themeColor);
        if (index === 0) {
          meta.removeAttribute("media");
        } else {
          meta.setAttribute("media", "not all");
        }
        return;
      }

      const systemColor = meta.getAttribute(SYSTEM_COLOR_ATTRIBUTE);
      if (systemColor !== null) {
        meta.setAttribute("content", systemColor);
        meta.removeAttribute(SYSTEM_COLOR_ATTRIBUTE);
      } else {
        const media = meta.getAttribute("media");
        const fallbackColor = media ? SYSTEM_THEME_COLOR_BY_MEDIA[media] : null;
        if (fallbackColor) meta.setAttribute("content", fallbackColor);
      }

      const systemMediaPresent = meta.getAttribute(
        SYSTEM_MEDIA_PRESENT_ATTRIBUTE,
      );
      const systemMedia = meta.getAttribute(SYSTEM_MEDIA_ATTRIBUTE);
      if (systemMediaPresent === "true" && systemMedia !== null) {
        meta.setAttribute("media", systemMedia);
      } else if (systemMediaPresent === "false") {
        meta.removeAttribute("media");
      }
      meta.removeAttribute(SYSTEM_MEDIA_ATTRIBUTE);
      meta.removeAttribute(SYSTEM_MEDIA_PRESENT_ATTRIBUTE);
    });

  documentRef
    .querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
    .forEach((icon) => {
      if (display) {
        if (!icon.hasAttribute(SYSTEM_ICON_ATTRIBUTE)) {
          const systemHref = icon.getAttribute("href");
          if (systemHref !== null) {
            icon.setAttribute(SYSTEM_ICON_ATTRIBUTE, systemHref);
          }
        }
        icon.setAttribute("href", display.iconHref);
        return;
      }

      const systemHref = icon.getAttribute(SYSTEM_ICON_ATTRIBUTE);
      if (systemHref !== null) {
        icon.setAttribute("href", systemHref);
        icon.removeAttribute(SYSTEM_ICON_ATTRIBUTE);
      }
    });
}
