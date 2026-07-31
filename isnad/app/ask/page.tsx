"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AnswerMessage from "@/components/AnswerMessage";
import ChainLoader from "@/components/ChainLoader";
import IsnadChain from "@/components/IsnadChain";

type Message = {
  role: "user" | "assistant";
  content: string;
  routedToFinance?: boolean;
  routedToTafsir?: boolean;
  routedToHadith?: boolean;
  routedToFiqh?: boolean;
  routedToSeerah?: boolean;
  routedToAqidah?: boolean;
  routedToArabic?: boolean;
  routedToDawahTarbiyah?: boolean;
  error?: boolean;
};

const STARTERS = [
  "I joined prayer as the imam rose from rukūʿ. Did the rakʿah count?",
  "How do I calculate zakāh on savings and crypto?",
  "How can I verify whether a hadith is authentic?",
  "What is firmly established about the Hijrah and the cave?",
  "How do qadar and human choice fit together?",
  "Parse إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ and explain how its grammar shapes the translation.",
];

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const suggested = new URLSearchParams(window.location.search).get("q");
    if (suggested) setInput(suggested);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [input]);

  const ask = useCallback(async (question: string, history: Message[]) => {
    const nextMessages: Message[] = [...history, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setLastFailed(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setLastFailed(question);
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: data.error ?? "Something went wrong while answering this question.",
            error: true,
          },
        ]);
        return;
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.answer,
          routedToFinance: data.routedToFinance,
          routedToTafsir: data.routedToTafsir,
          routedToHadith: data.routedToHadith,
          routedToFiqh: data.routedToFiqh,
          routedToSeerah: data.routedToSeerah,
          routedToAqidah: data.routedToAqidah,
          routedToArabic: data.routedToArabic,
          routedToDawahTarbiyah: data.routedToDawahTarbiyah,
        },
      ]);
    } catch {
      setLastFailed(question);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "Could not reach the server. Check your connection and try again.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  function send(question: string) {
    const text = question.trim();
    if (!text || loading) return;
    ask(text, messages);
  }

  function retry() {
    if (!lastFailed || loading) return;
    ask(lastFailed, messages.slice(0, -2));
  }

  function newChat() {
    setMessages([]);
    setInput("");
    setLastFailed(null);
    textareaRef.current?.focus();
  }

  const hasStarted = messages.length > 0;

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-[var(--parchment)]">
      <header className="flex items-center justify-between border-b border-[var(--pine)]/10 px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Return to Isnad home">
          <span className="star-8 star-spin inline-block h-4 w-4 bg-[var(--pine)]" aria-hidden="true" />
          <span className="font-display text-lg tracking-tight text-[var(--pine-deep)]">Isnad</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/" className="hidden text-xs text-[var(--pine)]/60 transition hover:text-[var(--pine)] sm:block">
            About Isnad
          </Link>
          {hasStarted && (
            <button
              onClick={newChat}
              className="rounded-full border border-[var(--pine)]/20 px-3 py-1 text-xs text-[var(--pine)] transition-colors hover:bg-[var(--pine)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
            >
              New question
            </button>
          )}
        </div>
      </header>

      {!hasStarted ? (
        <section className="flex flex-1 flex-col justify-center px-5 pb-10 pt-12 text-center sm:px-8">
          <div className="mb-7 flex justify-center">
            <IsnadChain />
          </div>
          <h1 className="mx-auto max-w-2xl font-display text-3xl leading-[1.1] text-[var(--pine-deep)] sm:text-5xl">
            Ask, and trace the answer to its source.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[var(--ink)]/70 sm:text-base">
            Qur&apos;an first, then authentic Sunnah, the understanding of the Companions, and recognized scholarship. Sources and disagreement remain visible.
          </p>
          <div className="mx-auto mt-9 flex max-w-2xl flex-wrap justify-center gap-2">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                onClick={() => send(starter)}
                className="rounded-full border border-[var(--pine)]/20 px-3.5 py-2 text-left text-xs text-[var(--pine-deep)] transition-colors hover:border-[var(--pine)]/40 hover:bg-[var(--pine)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] sm:text-sm"
              >
                {starter}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8 sm:px-8">
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={`${message.role}-${index}`} className="max-w-[85%] self-end">
                  <div className="rounded-2xl rounded-br-sm bg-[var(--pine)] px-4 py-2.5 text-sm text-[var(--parchment-soft)] sm:text-base">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={`${message.role}-${index}`} className="w-full max-w-full self-start">
                  {message.error ? (
                    <div className="rounded-2xl border border-[#8a1f1f]/20 bg-[#fbf1f1] px-4 py-3.5 text-sm text-[#7a1f1f]">
                      <p className="font-semibold">{message.content}</p>
                      {lastFailed && index === messages.length - 1 && (
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
                      content={message.content}
                      routedToFinance={message.routedToFinance}
                      routedToTafsir={message.routedToTafsir}
                      routedToHadith={message.routedToHadith}
                      routedToFiqh={message.routedToFiqh}
                      routedToSeerah={message.routedToSeerah}
                      routedToAqidah={message.routedToAqidah}
                      routedToArabic={message.routedToArabic}
                      routedToDawahTarbiyah={message.routedToDawahTarbiyah}
                    />
                  )}
                </div>
              ),
            )}
            {loading && <ChainLoader />}
            <div ref={scrollRef} />
          </div>
        </div>
      )}

      <div className="border-t border-[var(--pine)]/10 bg-[var(--parchment-soft)] px-5 py-4 sm:px-8">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <label htmlFor="question" className="sr-only">Your question</label>
          <textarea
            id="question"
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
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
          Educational guidance, not a binding fatwa. Consult a qualified local scholar for personal high-stakes rulings.
        </p>
      </div>
    </main>
  );
}
