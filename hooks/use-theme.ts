"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "plotguard-theme";

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  window.addEventListener("storage", callback);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

/** Reactive current theme, driven by the `.dark` class on <html>. SSR-safe. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

export function toggleTheme() {
  setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
}

/**
 * Blocking script that applies the persisted theme before first paint (avoids
 * a flash). Rendered from the server layout, so it never triggers React's
 * client-side "script tag" warning.
 */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem('${STORAGE_KEY}')==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}})();`;
