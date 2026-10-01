"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    if (!dialog) {
      return;
    }

    // 削除確認やpendingで要素が入れ替わるため、初回のリストを保持しない(P16-ui)。
    const getFocusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => {
          if (element.tabIndex < 0 || element.matches(":disabled")) {
            return false;
          }
          for (
            let current: HTMLElement | null = element;
            current && current !== dialog;
            current = current.parentElement
          ) {
            const style = window.getComputedStyle(current);
            if (
              current.hidden ||
              current.hasAttribute("inert") ||
              current.getAttribute("aria-hidden") === "true" ||
              style.display === "none" ||
              style.visibility === "hidden"
            ) {
              return false;
            }
          }
          return true;
        },
      );
    const keepFocusInside = () => {
      const focusable = getFocusable();
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        (focusable[0] ?? dialog).focus();
      }
    };
    keepFocusInside();
    const observer = new MutationObserver(keepFocusInside);
    observer.observe(dialog, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "disabled",
        "hidden",
        "inert",
        "tabindex",
        "class",
        "style",
        "aria-hidden",
      ],
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey
          ? focusable[focusable.length - 1]!
          : focusable[0]!
        ).focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      observer.disconnect();
      dialog.removeEventListener("keydown", handleKeyDown);
      if (previous?.isConnected) {
        previous.focus();
      }
    };
  }, []);

  return dialogRef;
}
