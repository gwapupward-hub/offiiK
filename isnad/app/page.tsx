"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import IsnadChain from "@/components/IsnadChain";
import AnswerMessage from "@/components/AnswerMessage";
import ChainLoader from "@/components/ChainLoader";

type Message = {
  role: "user" | "assistant";
  content: string;
  routedToFinance?: boolean;
  routedToTafsir?: boolean;
  routedToHadith?: boolean;
  error?: boolean;
};

const STARTERS = [
  "What is the ruling on taking a mortgage to buy a home?",
  "How do I calculate zakāh on savings and crypto?",
  "How can I verify whether a hadith is authentic?",
  "Is freelance income from a gambling-adjacent platform halal?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // Auto-grow the textarea up to its max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const ask = useCallback(
    async (question: string, history: Message[]) => {
      const nextMessages: Message[] = [...history, { role: "user", content: question }];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);
      setLastFailed(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.map(({ role, content }) => ({ role, content })),
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setLastFailed(question);
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
            {
              role: "assistant",
              content: data.answer,
              routedToFinance: data.routedToFinance,
              routedToTafsir: data.routedToTafsir,
              routedToHadith: data.routedToHadith,
            },
          ]);
        }
      } catch {
        setLastFailed(question);
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
    },
    []
  );

  function send(question: string) {
    const text = question.trim();
    if (!text || loading) return;
    ask(text, messages);
  }

  function retry() {
    if (!lastFailed || loading) return;
    // Drop the failed question and its error, then re-ask.
    const history = messages.slice(0, -2);
    ask(lastFailed, history);
  }

  function newChat() {
    setMessages([]);
    setInput("");
    setLastFailed(null);
    textareaRef.current?.focus();
  }

  const hasStarted = messages.length > 0;

  return (
    <main className="flex flex-1 flex-col bg-[var(--parchment)]">
      <header className="flex items-center justify-between border-b border-[var(--pine)]/10 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="star-8 star-spin inline-block h-4 w-4 bg-[var(--pine)]" aria-hidden="true" />
          <span className="font-display text-lg tracking-tight text-[var(--pine-deep)]">Isnad</span>
        </div>
        {hasStarted ? (
          <button
            onClick={newChat}
            className="rounded-full border border-[var(--pine)]/20 px-3 py-1 text-xs text-[var(--pine)] transition-colors hover:bg-[var(--pine)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
          >
            New question
          </button>
        ) : (
          <span className="hidden text-xs text-[var(--pine)]/60 sm:block">
            Qur&apos;an · Sunnah · Companions · Scholars
          </span>
        )}
      </header>

      {!hasStarted && (
        <section className="px-5 pb-10 pt-14 text-center sm:px-8 sm:pt-20">
          <div className="mb-8 flex justify-center">
            <IsnadChain />
          </div>
          <h1 className="mx-auto max-w-2xl font-display text-3xl leading-[1.1] text-[var(--pine-deep)] sm:text-5xl">
            Ask, and trace the answer to its source.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[var(--ink)]/70 sm:text-base">
            An <span className="font-arabic">isnād</span> is the chain of transmission behind a
            piece of knowledge — who said it, and who they heard it from. Every answer here is
            built the same way: Qur&apos;an first, then authentic Sunnah, then how the Companions
            understood it, then recognized scholarship. Disagreement is never hidden.
          </p>
          <div className="mx-auto mt-9 flex max-w-2xl flex-wrap justify-center gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-[var(--pine)]/20 px-3.5 py-2 text-left text-xs text-[var(--pine-deep)] transition-colors hover:border-[var(--pine)]/40 hover:bg-[var(--pine)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] sm:text-sm"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      )}

      {hasStarted && (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8 sm:px-8">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="max-w-[85%] self-end">
                  <div className="rounded-2xl rounded-br-sm bg-[var(--pine)] px-4 py-2.5 text-sm text-[var(--parchment-soft)] sm:text-base">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="w-full max-w-full self-start">
                  {m.error ? (
                    <div className="rounded-2xl border border-[#8a1f1f]/20 bg-[#fbf1f1] px-4 py-3.5 text-sm text-[#7a1f1f]">
                      <p className="font-semibold">{m.content}</p>
                      {lastFailed && i === messages.length - 1 && (
                        <button
                          onClick={retry}
                          className="mt-2.5 rounded-full border border-[#8a1f1f]/30 px-3 py-1 text-xs font-semibold transition-colors hover:bg-[#8a1f1f]/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a1f1f]"
                        >
                          Try again
                        </button>
                      )}
                    </div>
                  ) : (
                    <AnswerMessage
                      content={m.content}
                      routedToFinance={m.routedToFinance}
                      routedToTafsir={m.routedToTafsir}
                      routedToHadith={m.routedToHadith}
                    />
                  )}
                </div>
              )
            )}
            {loading && <ChainLoader />}
            <div ref={scrollRef} />
          </div>
        </div>
      )}

      <div className="border-t border-[var(--pine)]/10 bg-[var(--parchment-soft)] px-5 py-4 sm:px-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <label htmlFor="question" className="sr-only">
            Your question
          </label>
          <textarea
            id="question"
            ref={textareaRef}
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
            className="max-h-40 flex-1 resize-none rounded-xl border border-[var(--pine)]/20 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/50 sm:text-base"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-xl bg-[var(--pine)] px-4 py-2.5 text-sm font-medium text-[var(--parchment-soft)] transition-colors hover:bg-[var(--pine-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-40"
          >
            Ask
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-2xl text-[11px] text-[var(--ink)]/45">
          Educational guidance, not a binding fatwa. For divorce, inheritance, or other
          high-stakes rulings, consult a qualified local scholar.
        </p>
      </div>
    </main>
  );
}
