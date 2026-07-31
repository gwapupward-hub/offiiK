"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AnswerMessage from "@/components/AnswerMessage";
import ChainLoader from "@/components/ChainLoader";
import IsnadChain from "@/components/IsnadChain";
import type {
  CitationRecord,
  ConversationSummary,
  StoredMessage,
  UserProfile,
  UserSettings,
} from "@/lib/appTypes";
import { consumeEventStream } from "@/lib/sseClient";

type View = "chat" | "history" | "profile" | "settings";
type WebAppSdk = (typeof import("@twa-dev/sdk"))["default"];

type Message = {
  id?: string;
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
  citations?: CitationRecord[];
  error?: boolean;
};

const STARTERS = [
  "I joined prayer as the imam rose from rukūʿ. Did the rakʿah count?",
  "How do I calculate zakāh on savings and crypto?",
  "How can I verify whether a hadith is authentic?",
  "What is firmly established about the Hijrah and the cave?",
  "Design a wise first-month support plan for a new Muslim.",
];

function routingFrom(data: Record<string, unknown>) {
  return {
    routedToFinance: Boolean(data.routedToFinance),
    routedToTafsir: Boolean(data.routedToTafsir),
    routedToHadith: Boolean(data.routedToHadith),
    routedToFiqh: Boolean(data.routedToFiqh),
    routedToSeerah: Boolean(data.routedToSeerah),
    routedToAqidah: Boolean(data.routedToAqidah),
    routedToArabic: Boolean(data.routedToArabic),
    routedToDawahTarbiyah: Boolean(data.routedToDawahTarbiyah),
  };
}

function toMessage(message: StoredMessage): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    citations: message.citations,
    ...message.routing,
  };
}

export default function TelegramPage() {
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [notice, setNotice] = useState<string>("");

  const webAppRef = useRef<WebAppSdk | null>(null);
  const initDataRef = useRef("");
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const authorizedFetch = useCallback((url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (initDataRef.current) headers.set("X-Telegram-Init-Data", initDataRef.current);
    return fetch(url, { ...options, headers });
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!initDataRef.current) return;
    const response = await authorizedFetch("/api/account");
    if (!response.ok) return;
    const data = (await response.json()) as {
      profile: UserProfile;
      settings: UserSettings;
    };
    setProfile(data.profile);
    setSettings(data.settings);
  }, [authorizedFetch]);

  const refreshHistory = useCallback(async () => {
    if (!initDataRef.current) return;
    const response = await authorizedFetch("/api/conversations");
    if (!response.ok) return;
    const data = (await response.json()) as { conversations: ConversationSummary[] };
    setConversations(data.conversations);
  }, [authorizedFetch]);

  const ask = useCallback(
    async (question: string, history: Message[]) => {
      const nextMessages: Message[] = [...history, { role: "user", content: question }];
      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      setInput("");
      setLoading(true);
      setNotice("");

      const updatePending = (update: (message: Message) => Message) => {
        setMessages((current) => {
          const copy = [...current];
          const index = copy.length - 1;
          if (index >= 0 && copy[index].role === "assistant") copy[index] = update(copy[index]);
          return copy;
        });
      };

      try {
        const response = await authorizedFetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            conversationId,
            messages: nextMessages.map(({ role, content }) => ({ role, content })),
          }),
        });

        await consumeEventStream(response, ({ event, data }) => {
          if ((event === "meta" || event === "done") && typeof data.conversationId === "string") {
            setConversationId(data.conversationId);
          }
          if (event === "meta" || event === "done") {
            updatePending((message) => ({ ...message, ...routingFrom(data) }));
          }
          if (event === "delta" && typeof data.delta === "string") {
            updatePending((message) => ({ ...message, content: message.content + data.delta }));
          }
          if (event === "done" && Array.isArray(data.citations)) {
            updatePending((message) => ({
              ...message,
              citations: data.citations as CitationRecord[],
            }));
          }
          if (event === "error") {
            throw new Error(typeof data.error === "string" ? data.error : "Unable to answer.");
          }
        });
        await refreshHistory();
      } catch (error) {
        updatePending((message) => ({
          ...message,
          content: error instanceof Error ? error.message : "Couldn't reach the server.",
          error: true,
        }));
      } finally {
        setLoading(false);
      }
    },
    [authorizedFetch, conversationId, refreshHistory]
  );

  const send = useCallback(
    (question: string) => {
      const text = question.trim();
      if (!text || loading) return;
      void ask(text, messages);
    },
    [ask, loading, messages]
  );

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    let cancelled = false;
    import("@twa-dev/sdk")
      .then(({ default: WebApp }) => {
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
      })
      .catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void Promise.all([refreshAccount(), refreshHistory()]);
  }, [ready, refreshAccount, refreshHistory]);

  useEffect(() => {
    const WebApp = webAppRef.current;
    if (!WebApp || !ready) return;
    const button = WebApp.MainButton;
    const handler = () => sendRef.current(input);

    if (view !== "chat") {
      button.hide();
      return;
    }
    if (loading) {
      button.setText("Tracing the chain…");
      button.showProgress(false);
      button.show();
    } else {
      button.hideProgress();
      button.setText("Ask");
      if (input.trim()) {
        button.enable();
        button.show();
      } else {
        button.hide();
      }
    }
    button.onClick(handler);
    return () => button.offClick(handler);
  }, [ready, input, loading, view]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.style.colorScheme =
      settings.theme === "system" ? "light dark" : settings.theme;
  }, [settings]);

  async function newChat() {
    setMessages([]);
    setConversationId(null);
    setView("chat");
    if (!initDataRef.current) return;
    const response = await authorizedFetch("/api/conversations", { method: "POST" });
    if (response.ok) {
      const data = (await response.json()) as { conversation: ConversationSummary };
      setConversationId(data.conversation.id);
      await refreshHistory();
    }
  }

  async function openConversation(id: string) {
    const response = await authorizedFetch(`/api/conversations/${id}`);
    if (!response.ok) return;
    const data = (await response.json()) as {
      conversation: ConversationSummary;
      messages: StoredMessage[];
    };
    setConversationId(data.conversation.id);
    setMessages(data.messages.map(toMessage));
    setView("chat");
  }

  async function saveAccount() {
    if (!profile || !settings) return;
    setNotice("Saving…");
    const response = await authorizedFetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: { displayName: profile.displayName, bio: profile.bio },
        settings,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setNotice(typeof data.error === "string" ? data.error : "Unable to save changes.");
      return;
    }
    const data = (await response.json()) as {
      profile: UserProfile;
      settings: UserSettings;
    };
    setProfile(data.profile);
    setSettings(data.settings);
    setNotice("Saved.");
  }

  const authenticated = Boolean(initDataRef.current);
  const hasStarted = messages.length > 0;
  const awaitingFirstToken = loading && messages.at(-1)?.content === "";

  return (
    <main
      ref={containerRef}
      className="flex min-h-screen flex-1 flex-col"
      style={{
        background: "var(--tg-theme-bg-color, var(--parchment))",
        color: "var(--tg-theme-text-color, var(--ink))",
      }}
    >
      <header
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--tg-theme-hint-color, rgba(18,56,50,0.1))" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="star-8 star-spin inline-block h-4 w-4 bg-[var(--gold)]" aria-hidden="true" />
          <span className="font-display text-lg tracking-tight">Isnad</span>
        </div>
        {view === "chat" && hasStarted && (
          <button className="rounded-full border px-3 py-1 text-xs" onClick={() => void newChat()}>
            New chat
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto pb-20">
        {view === "chat" && (
          <ChatView
            messages={messages}
            input={input}
            setInput={setInput}
            send={send}
            loading={loading}
            hasStarted={hasStarted}
            awaitingFirstToken={awaitingFirstToken}
            scrollRef={scrollRef}
          />
        )}

        {view === "history" && (
          <section className="mx-auto max-w-2xl px-5 py-7">
            <h1 className="font-display text-2xl">Conversation history</h1>
            {!authenticated ? (
              <EmptyAccountState />
            ) : conversations.length === 0 ? (
              <p className="mt-4 text-sm opacity-65">No saved conversations yet.</p>
            ) : (
              <div className="mt-5 space-y-2">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => void openConversation(conversation.id)}
                    className="w-full rounded-2xl border px-4 py-3 text-left"
                  >
                    <span className="block text-sm font-semibold">{conversation.title}</span>
                    <span className="mt-1 block text-xs opacity-55">
                      {new Date(conversation.updatedAt).toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "profile" && (
          <section className="mx-auto max-w-2xl px-5 py-7">
            <h1 className="font-display text-2xl">Profile</h1>
            {!authenticated || !profile ? (
              <EmptyAccountState />
            ) : (
              <div className="mt-5 space-y-4">
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold">Display name</span>
                  <input
                    value={profile.displayName}
                    onChange={(event) =>
                      setProfile({ ...profile, displayName: event.target.value })
                    }
                    className="w-full rounded-xl border bg-transparent px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold">Bio</span>
                  <textarea
                    value={profile.bio}
                    onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
                    rows={4}
                    className="w-full rounded-xl border bg-transparent px-3 py-2"
                  />
                </label>
                <p className="text-xs opacity-55">
                  Telegram: {profile.username ? `@${profile.username}` : profile.telegramUserId}
                </p>
                <SaveButton onClick={() => void saveAccount()} notice={notice} />
              </div>
            )}
          </section>
        )}

        {view === "settings" && (
          <section className="mx-auto max-w-2xl px-5 py-7">
            <h1 className="font-display text-2xl">Settings</h1>
            {!authenticated || !settings ? (
              <EmptyAccountState />
            ) : (
              <div className="mt-5 space-y-4 text-sm">
                <SelectSetting
                  label="Answer length"
                  value={settings.answerLength}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      answerLength: value as UserSettings["answerLength"],
                    })
                  }
                  options={["concise", "balanced", "detailed"]}
                />
                <SelectSetting
                  label="Citation depth"
                  value={settings.citationDepth}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      citationDepth: value as UserSettings["citationDepth"],
                    })
                  }
                  options={["standard", "detailed"]}
                />
                <SelectSetting
                  label="Theme"
                  value={settings.theme}
                  onChange={(value) =>
                    setSettings({ ...settings, theme: value as UserSettings["theme"] })
                  }
                  options={["system", "light", "dark"]}
                />
                <ToggleSetting
                  label="Show Arabic source text"
                  checked={settings.showArabic}
                  onChange={(checked) => setSettings({ ...settings, showArabic: checked })}
                />
                <ToggleSetting
                  label="Include transliteration"
                  checked={settings.transliteration}
                  onChange={(checked) => setSettings({ ...settings, transliteration: checked })}
                />
                <ToggleSetting
                  label="Conversation memory"
                  checked={settings.memoryEnabled}
                  onChange={(checked) => setSettings({ ...settings, memoryEnabled: checked })}
                />
                <SaveButton onClick={() => void saveAccount()} notice={notice} />
              </div>
            )}
          </section>
        )}
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t px-2 py-2"
        style={{ background: "var(--tg-theme-secondary-bg-color, var(--parchment-soft))" }}
        aria-label="Mini App navigation"
      >
        {(["chat", "history", "profile", "settings"] as View[]).map((item) => (
          <button
            key={item}
            onClick={() => setView(item)}
            className={`rounded-xl px-2 py-2 text-xs capitalize ${view === item ? "font-bold" : "opacity-60"}`}
          >
            {item}
          </button>
        ))}
      </nav>
    </main>
  );
}

function ChatView({
  messages,
  input,
  setInput,
  send,
  loading,
  hasStarted,
  awaitingFirstToken,
  scrollRef,
}: {
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  send: (value: string) => void;
  loading: boolean;
  hasStarted: boolean;
  awaitingFirstToken: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {!hasStarted ? (
        <section className="px-5 pb-10 pt-10 text-center">
          <div className="mb-7 flex justify-center"><IsnadChain /></div>
          <h1 className="mx-auto max-w-2xl font-display text-2xl leading-[1.15]">
            Ask, and trace the answer to its source.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed opacity-70">
            Qur&apos;an first, then authentic Sunnah, the Companions, and recognized scholarship.
          </p>
          <div className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-2">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                onClick={() => send(starter)}
                className="rounded-full border px-3.5 py-2 text-left text-xs sm:text-sm"
              >
                {starter}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8">
          {messages.map((message, index) =>
            message.role === "user" ? (
              <div key={index} className="max-w-[85%] self-end">
                <div
                  className="rounded-2xl rounded-br-sm px-4 py-2.5 text-sm"
                  style={{
                    background: "var(--tg-theme-button-color, var(--pine))",
                    color: "var(--tg-theme-button-text-color, var(--parchment-soft))",
                  }}
                >
                  {message.content}
                </div>
              </div>
            ) : message.content ? (
              <div key={index} className="w-full self-start">
                {message.error ? (
                  <div className="rounded-2xl border border-[#8a1f1f]/20 bg-[#fbf1f1] px-4 py-3 text-sm text-[#7a1f1f]">
                    {message.content}
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
            ) : null
          )}
          {awaitingFirstToken && <ChainLoader />}
          <div ref={scrollRef} />
        </div>
      )}

      <div
        className="sticky bottom-16 px-5 py-4"
        style={{ background: "var(--tg-theme-secondary-bg-color, var(--parchment-soft))" }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <textarea
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
            className="max-h-40 flex-1 resize-none rounded-xl border bg-transparent px-4 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-40"
            style={{
              background: "var(--tg-theme-button-color, var(--pine))",
              color: "var(--tg-theme-button-text-color, var(--parchment-soft))",
            }}
          >
            Ask
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-2xl text-[11px] opacity-45">
          Educational guidance, not a binding fatwa.
        </p>
      </div>
    </>
  );
}

function EmptyAccountState() {
  return (
    <p className="mt-4 rounded-2xl border px-4 py-3 text-sm opacity-70">
      Open this Mini App from @the_isnad_bot to use authenticated profile, history, and settings.
    </p>
  );
}

function SaveButton({ onClick, notice }: { onClick: () => void; notice: string }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        className="rounded-xl px-4 py-2 text-sm font-semibold"
        style={{
          background: "var(--tg-theme-button-color, var(--pine))",
          color: "var(--tg-theme-button-text-color, var(--parchment-soft))",
        }}
      >
        Save changes
      </button>
      <span className="text-xs opacity-60">{notice}</span>
    </div>
  );
}

function SelectSetting({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border bg-transparent px-3 py-2 capitalize"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function ToggleSetting({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-xl border px-3 py-3">
      <span className="font-semibold">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}

function applyThemeParams(element: HTMLElement | null, themeParams: object | undefined) {
  if (!element || !themeParams) return;
  for (const [key, value] of Object.entries(themeParams as Record<string, string | undefined>)) {
    if (value) element.style.setProperty(`--tg-theme-${key.replace(/_/g, "-")}`, value);
  }
}
