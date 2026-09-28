"use client";

import { useState } from "react";
import Link from "next/link";
import type { ConversationSummary } from "@/lib/appTypes";

type ConversationHistoryProps = {
  authenticated: boolean;
  conversations: ConversationSummary[];
  query: string;
  loading: boolean;
  error: string;
  onQueryChange: (value: string) => void;
  onOpen: (id: string) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>;
  onTogglePin: (conversation: ConversationSummary) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
};

export default function ConversationHistory({
  authenticated,
  conversations,
  query,
  loading,
  error,
  onQueryChange,
  onOpen,
  onRename,
  onTogglePin,
  onArchive,
}: ConversationHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  }

  function startRename(conversation: ConversationSummary) {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  }

  async function submitRename(id: string) {
    const title = editingTitle.trim();
    if (!title) return;
    await run(id, () => onRename(id, title));
    setEditingId(null);
    setEditingTitle("");
  }

  async function confirmArchive(id: string) {
    if (!window.confirm("Archive this conversation? You can no longer open it from history.")) {
      return;
    }
    await run(id, () => onArchive(id));
  }

  return (
    <section className="telegram-screen">
      <div className="telegram-screen-heading">
        <div>
          <p className="telegram-screen-kicker">
            Personal knowledge
          </p>
          <h1>Saved conversations</h1>
        </div>
        {authenticated && (
          <div className="mt-3">
            <div className="telegram-route-pills">
              <a
                href="/telegram/daily"
                className="telegram-route-pill"
              >
                Daily knowledge
              </Link>
              <a
                href="/telegram/learn"
                className="telegram-route-pill"
              >
                Guided learning
              </Link>
              <a
                href="/telegram/library"
                className="telegram-route-pill"
              >
                Bookmarks &amp; notes
              </Link>
            </div>
            <span className="telegram-account-meta mt-2 block">
              {conversations.length} {conversations.length === 1 ? "chat" : "chats"}
            </span>
          </div>
        )}
      </div>

      {!authenticated ? (
        <p className="telegram-account-empty">
          Open this Mini App from @the_isnad_bot to use authenticated conversation history.
        </p>
      ) : (
        <>
          <label className="mt-5 block">
            <span className="sr-only">Search saved conversations</span>
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search titles and messages…"
              className="telegram-text-field"
            />
          </label>

          {error && (
            <p className="telegram-error-banner mt-3">
              {error}
            </p>
          )}

          {loading ? (
            <div className="mt-6 space-y-2" aria-label="Loading saved conversations">
              {[0, 1, 2].map((item) => (
                <div key={item} className="telegram-skeleton-card !mx-0 !h-20 !w-full" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="telegram-account-empty mt-6">
              {query.trim()
                ? "No conversations match this search."
                : "No saved conversations yet. Ask a question and Isnad will preserve the chat here."}
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {conversations.map((conversation) => {
                const busy = busyId === conversation.id;
                const editing = editingId === conversation.id;
                return (
                  <article key={conversation.id} className="telegram-group px-4 py-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => void onOpen(conversation.id)}
                        disabled={busy || editing}
                        className="min-w-0 flex-1 text-left disabled:opacity-50"
                      >
                        <span className="flex items-center gap-2">
                          {conversation.pinnedAt && (
                            <span
                              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              aria-label="Pinned conversation"
                            >
                              Pinned
                            </span>
                          )}
                          <span className="truncate text-sm font-semibold">{conversation.title}</span>
                        </span>
                        <span className="mt-1 block text-xs opacity-50">
                          Updated {new Date(conversation.updatedAt).toLocaleString()}
                        </span>
                      </button>
                    </div>

                    {editing ? (
                      <form
                        className="mt-3 flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitRename(conversation.id);
                        }}
                      >
                        <input
                          autoFocus
                          value={editingTitle}
                          maxLength={120}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          className="telegram-text-field min-w-0 flex-1"
                          aria-label="Conversation title"
                        />
                        <button
                          type="submit"
                          disabled={busy || !editingTitle.trim()}
                          className="telegram-primary-button !min-h-10 px-3 text-xs disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="telegram-route-pill !min-h-10 rounded-xl"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2 border-t pt-3 text-xs">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(conversation.id, () => onTogglePin(conversation))}
                          className="telegram-route-pill disabled:opacity-40"
                        >
                          {conversation.pinnedAt ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startRename(conversation)}
                          className="telegram-route-pill disabled:opacity-40"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void confirmArchive(conversation.id)}
                          className="telegram-route-pill disabled:opacity-40"
                        >
                          Archive
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
