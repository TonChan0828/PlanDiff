import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyThemePreference,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/lib/theme/theme";
import { resolveBrowserThemeDisplay } from "@/lib/theme/browser-theme";

const SYSTEM_ICON_HREF = "/icon.svg?d7-test-generated";
const SYSTEM_COLORS = {
  light: "#2f4acb",
  dark: "#0e1116",
};

function installHeadFixtures() {
  const lightMeta = document.createElement("meta");
  lightMeta.dataset.d7Fixture = "light";
  lightMeta.name = "theme-color";
  lightMeta.setAttribute("media", "(prefers-color-scheme: light)");
  lightMeta.content = SYSTEM_COLORS.light;

  const darkMeta = document.createElement("meta");
  darkMeta.dataset.d7Fixture = "dark";
  darkMeta.name = "theme-color";
  darkMeta.setAttribute("media", "(prefers-color-scheme: dark)");
  darkMeta.content = SYSTEM_COLORS.dark;

  const icon = document.createElement("link");
  icon.dataset.d7Fixture = "icon";
  icon.rel = "icon";
  icon.href = SYSTEM_ICON_HREF;

  document.head.append(lightMeta, darkMeta, icon);
  return { lightMeta, darkMeta, icon };
}

function removeHeadFixtures() {
  document.head
    .querySelectorAll("[data-d7-fixture]")
    .forEach((element) => element.remove());
}

beforeEach(() => {
  installHeadFixtures();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.restoreAllMocks();
  removeHeadFixtures();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("browser theme display(D-7 S1)", () => {
  it.each([
    ["light", "#2f4acb", "/icons/favicon-light.svg"],
    ["dark", "#0e1116", "/icons/favicon-dark.svg"],
    ["structured", "#f9f7f3", "/icons/favicon-structured.svg"],
  ] as const)(
    "S1: %s resolves its approved color and favicon",
    (theme, color, icon) => {
      expect(resolveBrowserThemeDisplay(theme)).toEqual({
        themeColor: color,
        iconHref: icon,
      });
    },
  );
});

describe("browser theme initialization(D-7 S2 / S3)", () => {
  it.each(["light", "dark", "structured"] as const)(
    "S3: saved %s updates the page theme, both media colors, and one icon link",
    (theme) => {
      localStorage.setItem(THEME_STORAGE_KEY, theme);

      new Function(THEME_INIT_SCRIPT)();

      const { lightMeta, darkMeta, icon } = installFixtureReferences();
      const display = resolveBrowserThemeDisplay(theme);
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(lightMeta.content).toBe(display.themeColor);
      expect(lightMeta.hasAttribute("media")).toBe(false);
      expect(darkMeta.content).toBe(display.themeColor);
      expect(darkMeta.getAttribute("media")).toBe("not all");
      expect(icon.getAttribute("href")).toBe(display.iconHref);
      expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(
        1,
      );
      expect(
        document.head.querySelectorAll('meta[name="theme-color"]'),
      ).toHaveLength(2);
    },
  );

  it.each([null, "system", "not-a-theme"])(
    "S2: %s keeps system media colors and generated icon",
    (stored) => {
      if (stored !== null) localStorage.setItem(THEME_STORAGE_KEY, stored);

      expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();

      const { lightMeta, darkMeta, icon } = installFixtureReferences();
      expect(document.documentElement.dataset.theme).toBeUndefined();
      expect(lightMeta.content).toBe(SYSTEM_COLORS.light);
      expect(lightMeta.getAttribute("media")).toBe(
        "(prefers-color-scheme: light)",
      );
      expect(darkMeta.content).toBe(SYSTEM_COLORS.dark);
      expect(darkMeta.getAttribute("media")).toBe(
        "(prefers-color-scheme: dark)",
      );
      expect(icon.getAttribute("href")).toBe(SYSTEM_ICON_HREF);
    },
  );

  it("S2: a localStorage read exception falls back to system metadata", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage denied");
    });

    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();

    const { lightMeta, darkMeta, icon } = installFixtureReferences();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(lightMeta.content).toBe(SYSTEM_COLORS.light);
    expect(darkMeta.content).toBe(SYSTEM_COLORS.dark);
    expect(icon.getAttribute("href")).toBe(SYSTEM_ICON_HREF);
  });
});

describe("live browser theme updates(D-7 S4 / S5 / S6)", () => {
  it("S4: selecting each explicit theme updates both browser colors and the existing icon link", () => {
    for (const theme of ["light", "dark", "structured"] as const) {
      applyThemePreference(theme);

      const { lightMeta, darkMeta, icon } = installFixtureReferences();
      const display = resolveBrowserThemeDisplay(theme);
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(theme);
      expect(lightMeta.content).toBe(display.themeColor);
      expect(lightMeta.hasAttribute("media")).toBe(false);
      expect(darkMeta.content).toBe(display.themeColor);
      expect(darkMeta.getAttribute("media")).toBe("not all");
      expect(icon.getAttribute("href")).toBe(display.iconHref);
      expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(
        1,
      );
    }
  });

  it("S5: returning to system restores both media values and the original Next.js icon href", () => {
    applyThemePreference("structured");
    applyThemePreference("system");

    const { lightMeta, darkMeta, icon } = installFixtureReferences();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(lightMeta.content).toBe(SYSTEM_COLORS.light);
    expect(lightMeta.getAttribute("media")).toBe(
      "(prefers-color-scheme: light)",
    );
    expect(darkMeta.content).toBe(SYSTEM_COLORS.dark);
    expect(darkMeta.getAttribute("media")).toBe("(prefers-color-scheme: dark)");
    expect(icon.getAttribute("href")).toBe(SYSTEM_ICON_HREF);
  });

  it("S6: a failed write keeps the previous value while applying the current selection", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    new Function(THEME_INIT_SCRIPT)();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });

    expect(() => applyThemePreference("structured")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("structured");
    expect(installFixtureReferences().lightMeta.content).toBe("#f9f7f3");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    vi.restoreAllMocks();
    removeHeadFixtures();
    delete document.documentElement.dataset.theme;
    const { lightMeta, darkMeta, icon } = installHeadFixtures();
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(lightMeta.content).toBe("#2f4acb");
    expect(lightMeta.hasAttribute("media")).toBe(false);
    expect(darkMeta.content).toBe("#2f4acb");
    expect(darkMeta.getAttribute("media")).toBe("not all");
    expect(icon.getAttribute("href")).toBe("/icons/favicon-light.svg");
  });

  it("S6: a failed write with no prior value falls back to system after reload", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    applyThemePreference("structured");
    expect(document.documentElement.dataset.theme).toBe("structured");

    vi.restoreAllMocks();
    removeHeadFixtures();
    delete document.documentElement.dataset.theme;
    const { lightMeta, darkMeta, icon } = installHeadFixtures();
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(lightMeta.content).toBe(SYSTEM_COLORS.light);
    expect(lightMeta.getAttribute("media")).toBe(
      "(prefers-color-scheme: light)",
    );
    expect(darkMeta.content).toBe(SYSTEM_COLORS.dark);
    expect(darkMeta.getAttribute("media")).toBe("(prefers-color-scheme: dark)");
    expect(icon.getAttribute("href")).toBe(SYSTEM_ICON_HREF);
  });
});

function installFixtureReferences() {
  return {
    lightMeta: document.head.querySelector<HTMLMetaElement>(
      '[data-d7-fixture="light"]',
    )!,
    darkMeta: document.head.querySelector<HTMLMetaElement>(
      '[data-d7-fixture="dark"]',
    )!,
    icon: document.head.querySelector<HTMLLinkElement>(
      '[data-d7-fixture="icon"]',
    )!,
  };
}
