"use client";

import { useState } from "react";
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
    <section className="mx-auto max-w-2xl px-5 py-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-45">
            Personal knowledge
          </p>
          <h1 className="mt-1 font-display text-2xl">Saved conversations</h1>
        </div>
        {authenticated && (
          <span className="text-xs opacity-50">
            {conversations.length} {conversations.length === 1 ? "chat" : "chats"}
          </span>
        )}
      </div>

      {!authenticated ? (
        <p className="mt-4 rounded-2xl border px-4 py-3 text-sm opacity-70">
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
              className="w-full rounded-2xl border bg-transparent px-4 py-3 text-sm outline-none"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-xl border border-[#8a1f1f]/20 bg-[#fbf1f1] px-3 py-2 text-xs text-[#7a1f1f]">
              {error}
            </p>
          )}

          {loading ? (
            <div className="mt-6 space-y-2" aria-label="Loading saved conversations">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-2xl border opacity-40" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="mt-6 rounded-2xl border px-4 py-5 text-sm opacity-65">
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
                  <article key={conversation.id} className="rounded-2xl border px-4 py-3">
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
                          className="min-w-0 flex-1 rounded-xl border bg-transparent px-3 py-2 text-sm"
                          aria-label="Conversation title"
                        />
                        <button
                          type="submit"
                          disabled={busy || !editingTitle.trim()}
                          className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-xl border px-3 py-2 text-xs"
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
                          className="rounded-full border px-3 py-1.5 disabled:opacity-40"
                        >
                          {conversation.pinnedAt ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startRename(conversation)}
                          className="rounded-full border px-3 py-1.5 disabled:opacity-40"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void confirmArchive(conversation.id)}
                          className="rounded-full border px-3 py-1.5 disabled:opacity-40"
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
