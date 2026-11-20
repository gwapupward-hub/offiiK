"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CommunityManager from "@/components/CommunityManager";
import { bindTelegramChromeState, bindTelegramViewport, navigateBackInsideTelegram } from "@/lib/telegramMiniApp";

type WebAppSdk = (typeof import("@twa-dev/sdk"))["default"];

export default function TelegramCommunityPage() {
  const [ready, setReady] = useState(false);
  const [startParam, setStartParam] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const initDataRef = useRef("");
  const webAppRef = useRef<WebAppSdk | null>(null);
  const containerRef = useRef<HTMLElement>(null);

  const authorizedFetch = useCallback((url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (initDataRef.current) headers.set("X-Telegram-Init-Data", initDataRef.current);
    return fetch(url, { ...options, headers });
  }, []);

  const haptic = useCallback((kind: "success" | "error" | "selection") => {
    const feedback = webAppRef.current?.HapticFeedback;
    if (!feedback) return;
    if (kind === "selection") feedback.selectionChanged();
    else feedback.notificationOccurred(kind);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    return bindTelegramViewport(element);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let app: WebAppSdk | null = null;
    let themeHandler: (() => void) | null = null;
    let chromeCleanup: (() => void) | null = null;
    const goBack = () => navigateBackInsideTelegram();

    import("@twa-dev/sdk")
      .then(({ default: WebApp }: { default: WebAppSdk }) => {
        if (cancelled) return;
        app = WebApp;
        webAppRef.current = WebApp;
        WebApp.ready();
        WebApp.expand();
        WebApp.MainButton.hide();
        WebApp.BackButton.show();
        WebApp.BackButton.onClick(goBack);
        initDataRef.current = WebApp.initData ?? "";
        setAuthenticated(Boolean(initDataRef.current));
        setStartParam(WebApp.initDataUnsafe?.start_param ?? null);
        if (containerRef.current) {
          chromeCleanup = bindTelegramChromeState(
            containerRef.current,
            WebApp as Parameters<typeof bindTelegramChromeState>[1]
          );
        }
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
      chromeCleanup?.();
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
            <p className="telegram-eyebrow">Admin Control Center</p>
            <h1 className="telegram-section-name">Community Manager</h1>
          </div>
        </div>
      </header>

      <div className="telegram-scroll-region">
        {!ready ? (
          <div className="telegram-skeleton-card h-36" aria-label="Loading Community Manager" />
        ) : (
          <CommunityManager
            authenticated={authenticated}
            authorizedFetch={authorizedFetch}
            startParam={startParam}
            onHaptic={haptic}
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
