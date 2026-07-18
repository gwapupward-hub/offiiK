"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import IsnadChain from "@/components/IsnadChain";
import AnswerMessage from "@/components/AnswerMessage";
import ChainLoader from "@/components/ChainLoader";

type Message = {
  role: "user" | "assistant";
  content: string;
  routedToFinance?: boolean;
  error?: boolean;
};

// The Telegram Web App instance type, taken from the SDK's own bundled types
// so we don't need a separate @twa-dev/types dependency.
type WebAppSdk = (typeof import("@twa-dev/sdk"))["default"];

const STARTERS = [
  "What is the ruling on taking a mortgage to buy a home?",
  "How do I calculate zakāh on savings and crypto?",
  "What does the Qur'an say about honesty in trade?",
  "Is freelance income from a gambling-adjacent platform halal?",
];

/**
 * Telegram Mini App entry point.
 *
 * This is a thin Telegram-native shell around the same chat experience as the
 * main app: it reuses the existing answer/loader components and the same
 * `/api/chat` route, but boots the Telegram Web App SDK, mirrors the user's
 * Telegram theme, drives sending through the native MainButton, and attaches
 * the signed `initData` to every request so the backend can verify it.
 */
export default function TelegramPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // The Telegram WebApp instance and the raw signed initData string. Both are
  // only available in the browser, so they're populated on mount.
  const webAppRef = useRef<WebAppSdk | null>(null);
  const initDataRef = useRef<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = useCallback(async (question: string, history: Message[]) => {
    const nextMessages: Message[] = [...history, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (initDataRef.current) {
        headers["X-Telegram-Init-Data"] = initDataRef.current;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error ?? "Something went wrong answering this question.",
            error: true,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.answer, routedToFinance: data.routedToFinance },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Couldn't reach the server. Check your connection and try again.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  const send = useCallback(
    (question: string) => {
      const text = question.trim();
      if (!text || loading) return;
      ask(text, messages);
    },
    [ask, loading, messages]
  );

  // Keep a stable ref to the latest `send` so the native MainButton handler,
  // registered once per state change, always calls the current closure.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Boot the Telegram SDK on mount. Imported dynamically so the module (which
  // touches `window`) never runs during server rendering.
  useEffect(() => {
    let cancelled = false;

    import("@twa-dev/sdk").then(({ default: WebApp }) => {
      if (cancelled) return;
      WebApp.ready();
      WebApp.expand();

      webAppRef.current = WebApp;
      initDataRef.current = WebApp.initData ?? "";

      applyThemeParams(containerRef.current, WebApp.themeParams);
      WebApp.onEvent("themeChanged", () =>
        applyThemeParams(containerRef.current, WebApp.themeParams)
      );

      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Drive the native MainButton as the primary send action. Reflects the
  // current input/loading state and always invokes the latest `send`.
  useEffect(() => {
    const WebApp = webAppRef.current;
    if (!WebApp || !ready) return;

    const mb = WebApp.MainButton;
    const handler = () => sendRef.current(input);

    if (loading) {
      mb.setText("Tracing the chain…");
      mb.showProgress(false);
      mb.show();
    } else {
      mb.hideProgress();
      mb.setText("Ask");
      if (input.trim()) {
        mb.enable();
        mb.show();
      } else {
        mb.hide();
      }
    }

    mb.onClick(handler);
    return () => {
      mb.offClick(handler);
    };
  }, [ready, input, loading]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const hasStarted = messages.length > 0;

  return (
    <main
      ref={containerRef}
      className="flex min-h-full flex-1 flex-col"
      style={{
        // Fall back to the app's own palette outside Telegram (e.g. opening the
        // route in a normal browser), and adopt the user's theme inside it.
        background: "var(--tg-theme-bg-color, var(--parchment))",
        color: "var(--tg-theme-text-color, var(--ink))",
      }}
    >
      <header
        className="flex items-center gap-2.5 px-5 py-4"
        style={{ borderBottom: "1px solid var(--tg-theme-hint-color, rgba(18,56,50,0.1))" }}
      >
        <span className="star-8 star-spin inline-block h-4 w-4 bg-[var(--gold)]" aria-hidden="true" />
        <span
          className="font-display text-lg tracking-tight"
          style={{ color: "var(--tg-theme-text-color, var(--pine-deep))" }}
        >
          Isnad
        </span>
      </header>

      {!hasStarted && (
        <section className="px-5 pb-10 pt-10 text-center">
          <div className="mb-7 flex justify-center">
            <IsnadChain />
          </div>
          <h1
            className="mx-auto max-w-2xl font-display text-2xl leading-[1.15]"
            style={{ color: "var(--tg-theme-text-color, var(--pine-deep))" }}
          >
            Ask, and trace the answer to its source.
          </h1>
          <p
            className="mx-auto mt-3 max-w-xl text-sm leading-relaxed"
            style={{ color: "var(--tg-theme-hint-color, rgba(22,35,31,0.7))" }}
          >
            An <span className="font-arabic">isnād</span> is the chain of transmission behind a
            piece of knowledge. Every answer is built the same way: Qur&apos;an first, then
            authentic Sunnah, then the Companions, then recognized scholarship — disagreement is
            never hidden.
          </p>
          <div className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full px-3.5 py-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] sm:text-sm"
                style={{
                  border: "1px solid var(--tg-theme-hint-color, rgba(18,56,50,0.2))",
                  color: "var(--tg-theme-text-color, var(--pine-deep))",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      )}

      {hasStarted && (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="max-w-[85%] self-end">
                  <div
                    className="rounded-2xl rounded-br-sm px-4 py-2.5 text-sm sm:text-base"
                    style={{
                      background: "var(--tg-theme-button-color, var(--pine))",
                      color: "var(--tg-theme-button-text-color, var(--parchment-soft))",
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="w-full max-w-full self-start">
                  {m.error ? (
                    <div className="rounded-2xl border border-[#8a1f1f]/20 bg-[#fbf1f1] px-4 py-3.5 text-sm text-[#7a1f1f]">
                      <p className="font-semibold">{m.content}</p>
                    </div>
                  ) : (
                    <AnswerMessage content={m.content} routedToFinance={m.routedToFinance} />
                  )}
                </div>
              )
            )}
            {loading && <ChainLoader />}
            <div ref={scrollRef} />
          </div>
        </div>
      )}

      {/* Text entry. On Telegram the primary submit is the native MainButton
          above the keyboard; this inline button is the fallback for the same
          route opened in an ordinary browser (where MainButton is absent). */}
      <div
        className="px-5 py-4"
        style={{
          borderTop: "1px solid var(--tg-theme-hint-color, rgba(18,56,50,0.1))",
          background: "var(--tg-theme-secondary-bg-color, var(--parchment-soft))",
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <label htmlFor="tg-question" className="sr-only">
            Your question
          </label>
          <textarea
            id="tg-question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask a question of Islamic knowledge…"
            className="max-h-40 flex-1 resize-none rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/50 sm:text-base"
            style={{
              border: "1px solid var(--tg-theme-hint-color, rgba(18,56,50,0.2))",
              background: "var(--tg-theme-bg-color, #ffffff)",
              color: "var(--tg-theme-text-color, var(--ink))",
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-40"
            style={{
              background: "var(--tg-theme-button-color, var(--pine))",
              color: "var(--tg-theme-button-text-color, var(--parchment-soft))",
            }}
          >
            Ask
          </button>
        </form>
        <p
          className="mx-auto mt-2 max-w-2xl text-[11px]"
          style={{ color: "var(--tg-theme-hint-color, rgba(22,35,31,0.45))" }}
        >
          Educational guidance, not a binding fatwa. For divorce, inheritance, or other high-stakes
          rulings, consult a qualified local scholar.
        </p>
      </div>
    </main>
  );
}

/**
 * Maps Telegram's `themeParams` (snake_case keys like `bg_color`) onto CSS
 * custom properties (`--tg-theme-bg-color`, …) on the given element, so the
 * whole subtree can theme itself against the user's Telegram light/dark theme.
 */
function applyThemeParams(el: HTMLElement | null, themeParams: object | undefined) {
  if (!el || !themeParams) return;
  for (const [key, value] of Object.entries(themeParams as Record<string, string | undefined>)) {
    if (!value) continue;
    el.style.setProperty(`--tg-theme-${key.replace(/_/g, "-")}`, value);
  }
}
