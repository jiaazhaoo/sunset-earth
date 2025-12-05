'use client';

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "auto";

const STORAGE_KEY = "sunset-earth-theme";

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "auto";
    }
    const stored = window.localStorage.getItem(STORAGE_KEY) as
      | ThemeMode
      | null;
    return stored ?? "auto";
  });

  useEffect(() => {
    applyTheme(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
  }, [mode]);

  return (
    <div className="theme-toggle">
      <span>主题</span>
      {(["light", "dark", "auto"] as ThemeMode[]).map((item) => (
        <button
          key={item}
          type="button"
          className={`theme-toggle__button ${
            mode === item ? "is-active" : ""
          }`}
          onClick={() => setMode(item)}
        >
          {item === "light" ? "亮" : item === "dark" ? "暗" : "跟随"}
        </button>
      ))}
    </div>
  );
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  if (mode === "auto") {
    root.dataset.themeMode = "auto";
    root.removeAttribute("data-theme");
    return;
  }

  root.dataset.themeMode = mode;
  root.setAttribute("data-theme", mode);
}
