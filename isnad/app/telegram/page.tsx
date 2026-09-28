"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AnswerMessage from "@/components/AnswerMessage";
import ChainLoader from "@/components/ChainLoader";
import ConversationHistory from "@/components/ConversationHistory";
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
  {
    label: "Prayer",
    question: "I joined prayer as the imam rose from rukūʿ. Did the rakʿah count?",
  },
  {
    label: "Zakāh",
    question: "How do I calculate zakāh on savings and crypto?",
  },
  {
    label: "Hadith",
    question: "How can I verify whether a hadith is authentic?",
  },
  {
    label: "Seerah",
    question: "What is firmly established about the Hijrah and the cave?",
  },
  {
    label: "New Muslim",
    question: "Design a wise first-month support plan for a new Muslim.",
  },
];

const NAV_ITEMS: { id: View; label: string }[] = [
  { id: "chat", label: "Ask" },
  { id: "history", label: "Saved" },
  { id: "profile", label: "Profile" },
  { id: "settings", label: "Settings" },
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
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
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

  const refreshHistory = useCallback(
    async (search = "") => {
      if (!initDataRef.current) return;
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const query = new URLSearchParams({ limit: "100" });
        if (search.trim()) query.set("q", search.trim());
        const response = await authorizedFetch(`/api/conversations?${query.toString()}`);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setHistoryError(
            typeof data.error === "string" ? data.error : "Unable to load saved conversations."
          );
          return;
        }
        const data = (await response.json()) as { conversations: ConversationSummary[] };
        setConversations(data.conversations);
      } catch {
        setHistoryError("Unable to load saved conversations.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [authorizedFetch]
  );

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
        await refreshHistory(historyQuery);
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
    [authorizedFetch, conversationId, historyQuery, refreshHistory]
  );

  const send = useCallback(
    (question: string) => {
      const text = question.trim();
      if (!text || loading) return;
      webAppRef.current?.HapticFeedback.impactOccurred("light");
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
    let app: WebAppSdk | null = null;
    let themeHandler: (() => void) | null = null;

    import("@twa-dev/sdk")
      .then(({ default: WebApp }) => {
        if (cancelled) return;
        app = WebApp;
        WebApp.ready();
        WebApp.expand();
        WebApp.BackButton.hide();
        WebApp.MainButton.hide();
        webAppRef.current = WebApp;
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
      app?.MainButton.hide();
      app?.BackButton.hide();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void Promise.all([refreshAccount(), refreshHistory()]);
  }, [ready, refreshAccount, refreshHistory]);

  useEffect(() => {
    if (!ready || view !== "history") return;
    const timer = window.setTimeout(() => {
      void refreshHistory(historyQuery);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [historyQuery, ready, refreshHistory, view]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.style.colorScheme =
      settings.theme === "system" ? "light dark" : settings.theme;
  }, [settings]);

  function selectView(nextView: View) {
    webAppRef.current?.HapticFeedback.selectionChanged();
    setNotice("");
    setView(nextView);
  }

  async function newChat() {
    webAppRef.current?.HapticFeedback.impactOccurred("light");
    setMessages([]);
    setConversationId(null);
    setView("chat");
    if (!initDataRef.current) return;
    const response = await authorizedFetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (response.ok) {
      const data = (await response.json()) as { conversation: ConversationSummary };
      setConversationId(data.conversation.id);
      await refreshHistory(historyQuery);
    }
  }

  async function openConversation(id: string) {
    setHistoryError("");
    const response = await authorizedFetch(`/api/conversations/${id}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setHistoryError(typeof data.error === "string" ? data.error : "Unable to open conversation.");
      return;
    }
    const data = (await response.json()) as {
      conversation: ConversationSummary;
      messages: StoredMessage[];
    };
    setConversationId(data.conversation.id);
    setMessages(data.messages.map(toMessage));
    setView("chat");
  }

  async function updateConversation(
    id: string,
    changes: { title?: string; pinned?: boolean }
  ) {
    setHistoryError("");
    const response = await authorizedFetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setHistoryError(typeof data.error === "string" ? data.error : "Unable to update conversation.");
      return;
    }
    await refreshHistory(historyQuery);
  }

  async function renameConversation(id: string, title: string) {
    await updateConversation(id, { title });
  }

  async function togglePinned(conversation: ConversationSummary) {
    await updateConversation(conversation.id, { pinned: !conversation.pinnedAt });
  }

  async function archiveConversation(id: string) {
    setHistoryError("");
    const response = await authorizedFetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setHistoryError(typeof data.error === "string" ? data.error : "Unable to archive conversation.");
      return;
    }
    if (conversationId === id) {
      setConversationId(null);
      setMessages([]);
    }
    await refreshHistory(historyQuery);
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
    <main ref={containerRef} className="telegram-main">
      <header className="telegram-topbar">
        <div className="telegram-brand">
          <span className="telegram-brand-mark" aria-hidden="true">
            <span className="star-8" />
          </span>
          <div className="min-w-0">
            <p className="telegram-eyebrow">Islamic knowledge</p>
            <span className="telegram-brand-name">Isnad</span>
          </div>
        </div>

        <div className="telegram-topbar-actions">
          <span className="telegram-view-chip">
            {NAV_ITEMS.find((item) => item.id === view)?.label ?? "Isnad"}
          </span>
          {view === "chat" && hasStarted && (
            <button
              type="button"
              className="telegram-icon-button"
              onClick={() => void newChat()}
              aria-label="Start a new chat"
              title="New chat"
            >
              <NavIcon name="new" />
            </button>
          )}
        </div>
      </header>

      <div className="telegram-scroll-region">
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
          <ConversationHistory
            authenticated={authenticated}
            conversations={conversations}
            query={historyQuery}
            loading={historyLoading}
            error={historyError}
            onQueryChange={setHistoryQuery}
            onOpen={openConversation}
            onRename={renameConversation}
            onTogglePin={togglePinned}
            onArchive={archiveConversation}
          />
        )}

        {view === "profile" && (
          <section className="telegram-screen">
            <div className="telegram-screen-heading">
              <p className="telegram-screen-kicker">Your account</p>
              <h1>Profile</h1>
              <p>Keep your Telegram identity and study profile simple and recognizable.</p>
            </div>

            {!authenticated || !profile ? (
              <EmptyAccountState />
            ) : (
              <>
                <div className="telegram-group">
                  <label className="telegram-field-row">
                    <span className="telegram-field-label">Display name</span>
                    <input
                      value={profile.displayName}
                      onChange={(event) =>
                        setProfile({ ...profile, displayName: event.target.value })
                      }
                      className="telegram-text-field"
                      autoComplete="name"
                    />
                  </label>
                  <label className="telegram-field-row">
                    <span className="telegram-field-label">Bio</span>
                    <textarea
                      value={profile.bio}
                      onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
                      rows={4}
                      className="telegram-text-field resize-none"
                      placeholder="A short note about your study goals"
                    />
                  </label>
                  <div className="telegram-field-row">
                    <span className="telegram-field-label">Telegram</span>
                    <span className="telegram-account-meta">
                      {profile.username ? `@${profile.username}` : profile.telegramUserId}
                    </span>
                  </div>
                </div>
                <SaveButton onClick={() => void saveAccount()} notice={notice} />
              </>
            )}
          </section>
        )}

        {view === "settings" && (
          <section className="telegram-screen">
            <div className="telegram-screen-heading">
              <p className="telegram-screen-kicker">Preferences</p>
              <h1>Settings</h1>
              <p>Control how Isnad presents sources, language support, and conversation memory.</p>
            </div>

            {!authenticated || !settings ? (
              <EmptyAccountState />
            ) : (
              <>
                <div className="telegram-group">
                  <SelectSetting
                    label="Answer length"
                    hint="Choose how much detail appears by default."
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
                    hint="Show standard or expanded source detail."
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
                    hint="Follow Telegram or choose a fixed appearance."
                    value={settings.theme}
                    onChange={(value) =>
                      setSettings({ ...settings, theme: value as UserSettings["theme"] })
                    }
                    options={["system", "light", "dark"]}
                  />
                </div>

                <div className="telegram-group">
                  <ToggleSetting
                    label="Arabic source text"
                    hint="Show the Arabic wording when source text is available."
                    checked={settings.showArabic}
                    onChange={(checked) => setSettings({ ...settings, showArabic: checked })}
                  />
                  <ToggleSetting
                    label="Transliteration"
                    hint="Include Latin-script pronunciation support."
                    checked={settings.transliteration}
                    onChange={(checked) => setSettings({ ...settings, transliteration: checked })}
                  />
                  <ToggleSetting
                    label="Conversation memory"
                    hint="Let Isnad use saved conversation context when available."
                    checked={settings.memoryEnabled}
                    onChange={(checked) => setSettings({ ...settings, memoryEnabled: checked })}
                  />
                </div>

                <SaveButton onClick={() => void saveAccount()} notice={notice} />
              </>
            )}
          </section>
        )}
      </div>

      <nav className="telegram-tabbar" aria-label="Mini App navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectView(item.id)}
            className="telegram-tab"
            data-active={view === item.id}
            aria-current={view === item.id ? "page" : undefined}
          >
            <NavIcon name={item.id} />
            <span>{item.label}</span>
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
        <section className="telegram-empty-chat">
          <div className="telegram-chain-wrap"><IsnadChain /></div>
          <p className="telegram-screen-kicker">Trace every answer</p>
          <h1>Ask with evidence, not guesswork.</h1>
          <p>
            Qur&apos;an first, then authentic Sunnah, the Companions, and recognized scholarship.
          </p>
          <div className="telegram-starter-grid">
            {STARTERS.map((starter) => (
              <button
                key={starter.question}
                type="button"
                onClick={() => send(starter.question)}
                className="telegram-starter-card"
              >
                <span className="telegram-starter-label">{starter.label}</span>
                <span className="telegram-starter-question">{starter.question}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="telegram-thread">
          {messages.map((message, index) =>
            message.role === "user" ? (
              <div key={message.id ?? index} className="telegram-user-message">
                <div className="telegram-user-bubble">{message.content}</div>
              </div>
            ) : message.content ? (
              <div key={message.id ?? index} className="telegram-assistant-message">
                {message.error ? (
                  <div className="telegram-error-banner">{message.content}</div>
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

      <div className="telegram-composer">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
          className="telegram-composer-form"
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
            placeholder="Ask Isnad…"
            aria-label="Ask Isnad"
            className="telegram-composer-input"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="telegram-send-button"
            aria-label={loading ? "Isnad is answering" : "Send question"}
          >
            <NavIcon name="send" />
          </button>
        </form>
        <p className="telegram-composer-note">
          Educational guidance, not a binding fatwa.
        </p>
      </div>
    </>
  );
}

function EmptyAccountState() {
  return (
    <p className="telegram-account-empty">
      Open this Mini App from @the_isnad_bot to use authenticated profile, history, and settings.
    </p>
  );
}

function SaveButton({ onClick, notice }: { onClick: () => void; notice: string }) {
  return (
    <div className="telegram-actions-row">
      <button type="button" onClick={onClick} className="telegram-primary-button">
        Save changes
      </button>
      <span className="telegram-save-notice" aria-live="polite">{notice}</span>
    </div>
  );
}

function SelectSetting({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="telegram-setting-row">
      <div>
        <span className="telegram-setting-copy">{label}</span>
        <span className="telegram-setting-hint block">{hint}</span>
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="telegram-select"
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
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="telegram-setting-row">
      <div>
        <span className="telegram-setting-copy">{label}</span>
        <span className="telegram-setting-hint block">{hint}</span>
      </div>
      <span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="telegram-switch-input"
        />
        <span className="telegram-switch" aria-hidden="true" />
      </span>
    </label>
  );
}

function NavIcon({ name }: { name: View | "new" | "send" }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "chat") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M7.5 18.5 4 20l1.1-3.7A8 8 0 1 1 7.5 18.5Z" /><path d="M8 11h8M8 14h5" /></svg>;
  }
  if (name === "history") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" /></svg>;
  }
  if (name === "profile") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.7-3.7 3-5.5 6.5-5.5s5.8 1.8 6.5 5.5" /></svg>;
  }
  if (name === "settings") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" /></svg>;
  }
  if (name === "new") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M12 5v14M5 12h14" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m5 12 14-7-4.5 14-3-5.5L5 12Z" /><path d="m11.5 13.5 3.5-3.5" /></svg>;
}

function applyThemeParams(element: HTMLElement | null, themeParams: object | undefined) {
  if (!element || !themeParams) return;
  for (const [key, value] of Object.entries(themeParams as Record<string, string | undefined>)) {
    if (value) element.style.setProperty(`--tg-theme-${key.replace(/_/g, "-")}`, value);
  }
}
