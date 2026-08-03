"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GuidedLearning from "@/components/GuidedLearning";

type WebAppSdk = (typeof import("@twa-dev/sdk"))["default"];

export default function TelegramLearningPage() {
  const [ready, setReady] = useState(false);
  const initDataRef = useRef("");
  const containerRef = useRef<HTMLElement>(null);

  const authorizedFetch = useCallback((url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (initDataRef.current) headers.set("X-Telegram-Init-Data", initDataRef.current);
    return fetch(url, { ...options, headers });
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("@twa-dev/sdk")
      .then(({ default: WebApp }: { default: WebAppSdk }) => {
        if (cancelled) return;
        WebApp.ready();
        WebApp.expand();
        initDataRef.current = WebApp.initData ?? "";
        applyThemeParams(containerRef.current, WebApp.themeParams);
        WebApp.onEvent("themeChanged", () =>
          applyThemeParams(containerRef.current, WebApp.themeParams)
        );
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      ref={containerRef}
      className="min-h-screen flex-1 pb-10"
      style={{
        background: "var(--tg-theme-bg-color, var(--parchment))",
        color: "var(--tg-theme-text-color, var(--ink))",
      }}
    >
      <header
        className="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 py-4"
        style={{
          background: "var(--tg-theme-bg-color, var(--parchment))",
          borderBottom: "1px solid var(--tg-theme-hint-color, rgba(18,56,50,0.1))",
        }}
      >
        <div className="flex flex-wrap gap-2">
          <a href="/telegram" className="rounded-full border px-3 py-1.5 text-xs font-semibold">
            Back to Isnad
          </a>
          <a href="/telegram/daily" className="rounded-full border px-3 py-1.5 text-xs font-semibold">
            Daily knowledge
          </a>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-45">
            Mini roadmap · Sprint 3
          </p>
          <h1 className="font-display text-lg">Guided Learning</h1>
        </div>
      </header>

      {!ready ? (
        <div className="mx-auto max-w-3xl px-5 py-10">
          <div className="h-36 animate-pulse rounded-3xl border opacity-40" />
        </div>
      ) : (
        <GuidedLearning
          authenticated={Boolean(initDataRef.current)}
          authorizedFetch={authorizedFetch}
        />
      )}
    </main>
  );
}

function applyThemeParams(element: HTMLElement | null, themeParams: object | undefined) {
  if (!element || !themeParams) return;
  for (const [key, value] of Object.entries(themeParams as Record<string, string | undefined>)) {
    if (value) element.style.setProperty(`--tg-theme-${key.replace(/_/g, "-")}`, value);
  }
}
