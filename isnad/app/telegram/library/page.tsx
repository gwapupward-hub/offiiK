"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import KnowledgeLibrary from "@/components/KnowledgeLibrary";

type WebAppSdk = (typeof import("@twa-dev/sdk"))["default"];

export default function TelegramLibraryPage() {
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
    let app: WebAppSdk | null = null;
    let themeHandler: (() => void) | null = null;
    const goBack = () => {
      window.location.assign("/telegram");
    };

    import("@twa-dev/sdk")
      .then(({ default: WebApp }: { default: WebAppSdk }) => {
        if (cancelled) return;
        app = WebApp;
        WebApp.ready();
        WebApp.expand();
        WebApp.MainButton.hide();
        WebApp.BackButton.show();
        WebApp.BackButton.onClick(goBack);
        initDataRef.current = WebApp.initData ?? "";

        const syncTheme = () => applyThemeParams(containerRef.current, WebApp.themeParams);
        themeHandler = syncTheme;
        syncTheme();
        WebApp.onEvent("themeChanged", syncTheme);
        setReady(true);
      })
      .catch(() => setReady(true));

    return () => {
      cancelled = true;
      if (app && themeHandler) app.offEvent("themeChanged", themeHandler);
      app?.BackButton.offClick(goBack);
      app?.BackButton.hide();
    };
  }, []);

  return (
    <main ref={containerRef} className="telegram-main">
      <header className="telegram-section-topbar">
        <div className="telegram-section-title">
          <span className="telegram-brand-mark" aria-hidden="true">
            <span className="star-8" />
          </span>
          <div className="min-w-0">
            <p className="telegram-eyebrow">Personal knowledge</p>
            <h1 className="telegram-section-name">Bookmarks & Notes</h1>
          </div>
        </div>

        <div className="telegram-route-pills" aria-label="Related sections">
            <a href="/telegram/daily" className="telegram-route-pill">
              Daily knowledge
            </a>
            <a href="/telegram/learn" className="telegram-route-pill">
              Guided learning
            </a>
        </div>
      </header>

      <div className="telegram-scroll-region">
        {!ready ? (
          <div className="telegram-skeleton-card h-32" aria-label="Loading Bookmarks & Notes" />
        ) : (
          <KnowledgeLibrary
            authenticated={Boolean(initDataRef.current)}
            authorizedFetch={authorizedFetch}
          />
        )}
      </div>
    </main>
  );
}

function applyThemeParams(element: HTMLElement | null, themeParams: object | undefined) {
  if (!element || !themeParams) return;
  for (const [key, value] of Object.entries(themeParams as Record<string, string | undefined>)) {
    if (value) element.style.setProperty(`--tg-theme-${key.replace(/_/g, "-")}`, value);
  }
}
