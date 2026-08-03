"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConversationSummary, StoredMessage } from "@/lib/appTypes";
import {
  BOOKMARK_KINDS,
  type BookmarkCollection,
  type BookmarkKind,
  type BookmarkRecord,
  type KnowledgeLibrary as KnowledgeLibraryData,
  type StudyNote,
} from "@/lib/libraryTypes";

type AuthorizedFetch = (url: string, options?: RequestInit) => Promise<Response>;
type Tab = "bookmarks" | "notes" | "collections" | "import";

const EMPTY_LIBRARY: KnowledgeLibraryData = {
  collections: [],
  bookmarks: [],
  notes: [],
};

export default function KnowledgeLibrary({
  authenticated,
  authorizedFetch,
}: {
  authenticated: boolean;
  authorizedFetch: AuthorizedFetch;
}) {
  const [library, setLibrary] = useState<KnowledgeLibraryData>(EMPTY_LIBRARY);
  const [tab, setTab] = useState<Tab>("bookmarks");
  const [query, setQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const [collectionName, setCollectionName] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");

  const [bookmarkKind, setBookmarkKind] = useState<BookmarkKind>("other");
  const [bookmarkTitle, setBookmarkTitle] = useState("");
  const [bookmarkContent, setBookmarkContent] = useState("");
  const [bookmarkNote, setBookmarkNote] = useState("");
  const [bookmarkTags, setBookmarkTags] = useState("");
  const [bookmarkCollection, setBookmarkCollection] = useState("");

  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [noteCollection, setNoteCollection] = useState("");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversation, setSelectedConversation] = useState("");
  const [conversationMessages, setConversationMessages] = useState<StoredMessage[]>([]);
  const [importCollection, setImportCollection] = useState("");

  const refresh = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (collectionFilter) params.set("collection", collectionFilter);
      const response = await authorizedFetch(`/api/library?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Unable to load your library.");
        return;
      }
      setLibrary(data.library as KnowledgeLibraryData);
    } catch {
      setError("Unable to load your library.");
    } finally {
      setLoading(false);
    }
  }, [authenticated, authorizedFetch, collectionFilter, query]);

  const loadConversations = useCallback(async () => {
    if (!authenticated) return;
    const response = await authorizedFetch("/api/conversations?limit=100");
    if (!response.ok) return;
    const data = (await response.json()) as { conversations: ConversationSummary[] };
    setConversations(data.conversations);
  }, [authenticated, authorizedFetch]);

  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setTimeout(() => void refresh(), 200);
    return () => window.clearTimeout(timer);
  }, [authenticated, refresh]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  async function post(body: Record<string, unknown>) {
    const response = await authorizedFetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Unable to save item.");
    }
    return data as Record<string, unknown>;
  }

  async function patch(type: "bookmark" | "note" | "collection", id: string, body: Record<string, unknown>) {
    const response = await authorizedFetch(`/api/library/${id}?type=${type}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Unable to update item.");
    }
  }

  async function remove(type: "bookmark" | "note" | "collection", id: string) {
    if (!window.confirm(`Delete this ${type}?`)) return;
    setBusyId(id);
    setError("");
    try {
      const response = await authorizedFetch(`/api/library/${id}?type=${type}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to delete item.");
      }
      setNotice(`${capitalize(type)} deleted.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete item.");
    } finally {
      setBusyId("");
    }
  }

  async function createCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await post({
        type: "collection",
        name: collectionName,
        description: collectionDescription,
      });
      setCollectionName("");
      setCollectionDescription("");
      setNotice("Collection created.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create collection.");
    }
  }

  async function createBookmark(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await post({
        type: "bookmark",
        kind: bookmarkKind,
        title: bookmarkTitle,
        content: bookmarkContent,
        note: bookmarkNote,
        tags: bookmarkTags,
        collectionId: bookmarkCollection || null,
      });
      setBookmarkTitle("");
      setBookmarkContent("");
      setBookmarkNote("");
      setBookmarkTags("");
      setNotice("Bookmark saved.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save bookmark.");
    }
  }

  async function createNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await post({
        type: "note",
        title: noteTitle,
        content: noteContent,
        tags: noteTags,
        collectionId: noteCollection || null,
      });
      setNoteTitle("");
      setNoteContent("");
      setNoteTags("");
      setNotice("Note saved.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save note.");
    }
  }

  async function openConversation(id: string) {
    setSelectedConversation(id);
    setConversationMessages([]);
    if (!id) return;
    setBusyId(id);
    setError("");
    try {
      const response = await authorizedFetch(`/api/conversations/${id}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to open conversation.");
      }
      setConversationMessages((data.messages as StoredMessage[]).filter((message) => message.role === "assistant"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open conversation.");
    } finally {
      setBusyId("");
    }
  }

  async function importMessage(message: StoredMessage) {
    setBusyId(message.id);
    setError("");
    try {
      await post({
        type: "bookmark",
        messageId: message.id,
        collectionId: importCollection || null,
      });
      setNotice("AI response saved to your bookmarks.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save response.");
    } finally {
      setBusyId("");
    }
  }

  async function editCollection(collection: BookmarkCollection) {
    const name = window.prompt("Collection name", collection.name);
    if (name === null) return;
    const description = window.prompt("Collection description", collection.description);
    if (description === null) return;
    setBusyId(collection.id);
    try {
      await patch("collection", collection.id, { name, description });
      setNotice("Collection updated.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update collection.");
    } finally {
      setBusyId("");
    }
  }

  async function editBookmark(bookmark: BookmarkRecord) {
    const title = window.prompt("Bookmark title", bookmark.title);
    if (title === null) return;
    const note = window.prompt("Personal note", bookmark.note);
    if (note === null) return;
    const tags = window.prompt("Tags, separated by commas", bookmark.tags.join(", "));
    if (tags === null) return;
    setBusyId(bookmark.id);
    try {
      await patch("bookmark", bookmark.id, { title, note, tags });
      setNotice("Bookmark updated.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update bookmark.");
    } finally {
      setBusyId("");
    }
  }

  async function editNote(note: StudyNote) {
    const title = window.prompt("Note title", note.title);
    if (title === null) return;
    const content = window.prompt("Note content", note.content);
    if (content === null) return;
    const tags = window.prompt("Tags, separated by commas", note.tags.join(", "));
    if (tags === null) return;
    setBusyId(note.id);
    try {
      await patch("note", note.id, { title, content, tags });
      setNotice("Note updated.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update note.");
    } finally {
      setBusyId("");
    }
  }

  async function moveItem(type: "bookmark" | "note", id: string, collectionId: string) {
    setBusyId(id);
    try {
      await patch(type, id, { collectionId: collectionId || null });
      setNotice(`${capitalize(type)} moved.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to move item.");
    } finally {
      setBusyId("");
    }
  }

  async function exportLibrary(format: "markdown" | "json") {
    setError("");
    try {
      const response = await authorizedFetch(`/api/library/export?format=${format}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Unable to export library.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `isnad-library.${format === "json" ? "json" : "md"}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(`${format === "json" ? "JSON" : "Markdown"} export prepared.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to export library.");
    }
  }

  if (!authenticated) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-8">
        <div className="rounded-3xl border px-5 py-6 text-sm opacity-75">
          Open this screen from @the_isnad_bot to use authenticated bookmarks, notes, collections,
          and exports.
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-5 py-7">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Bookmarks" value={library.bookmarks.length} />
        <Stat label="Notes" value={library.notes.length} />
        <Stat label="Collections" value={library.collections.length} />
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_220px]">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search bookmarks, notes, and tags…"
          className="w-full rounded-2xl border bg-transparent px-4 py-3 text-sm"
        />
        <CollectionSelect
          value={collectionFilter}
          collections={library.collections}
          onChange={setCollectionFilter}
          label="All collections"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => void exportLibrary("markdown")} className="rounded-full border px-3 py-1.5 text-xs">
          Export Markdown
        </button>
        <button onClick={() => void exportLibrary("json")} className="rounded-full border px-3 py-1.5 text-xs">
          Export JSON
        </button>
      </div>

      {(error || notice) && (
        <div className="mt-4 space-y-2">
          {error && <p className="rounded-xl border border-[#8a1f1f]/20 bg-[#fbf1f1] px-3 py-2 text-xs text-[#7a1f1f]">{error}</p>}
          {notice && <p className="rounded-xl border px-3 py-2 text-xs opacity-70">{notice}</p>}
        </div>
      )}

      <div className="mt-6 grid grid-cols-4 gap-1 rounded-2xl border p-1">
        {(["bookmarks", "notes", "collections", "import"] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-xl px-2 py-2 text-xs capitalize ${tab === item ? "font-bold" : "opacity-55"}`}
            style={tab === item ? { background: "var(--tg-theme-secondary-bg-color, var(--parchment-soft))" } : undefined}
          >
            {item === "import" ? "From chats" : item}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl border opacity-35" />)}
        </div>
      ) : (
        <>
          {tab === "bookmarks" && (
            <div className="mt-6 space-y-4">
              <details className="rounded-2xl border px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold">Add a custom bookmark</summary>
                <form onSubmit={createBookmark} className="mt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold">
                      Type
                      <select value={bookmarkKind} onChange={(event) => setBookmarkKind(event.target.value as BookmarkKind)} className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2 text-sm">
                        {BOOKMARK_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replace(/_/g, " ")}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold">
                      Collection
                      <CollectionSelect value={bookmarkCollection} collections={library.collections} onChange={setBookmarkCollection} label="Unfiled" compact />
                    </label>
                  </div>
                  <input value={bookmarkTitle} onChange={(event) => setBookmarkTitle(event.target.value)} maxLength={160} placeholder="Title" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm" />
                  <textarea value={bookmarkContent} onChange={(event) => setBookmarkContent(event.target.value)} rows={5} placeholder="Verse, hadith, research, or other content" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm" />
                  <textarea value={bookmarkNote} onChange={(event) => setBookmarkNote(event.target.value)} rows={2} placeholder="Personal note (optional)" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm" />
                  <input value={bookmarkTags} onChange={(event) => setBookmarkTags(event.target.value)} placeholder="Tags separated by commas" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm" />
                  <PrimaryButton label="Save bookmark" />
                </form>
              </details>

              {library.bookmarks.length === 0 ? <Empty text="No bookmarks match this view." /> : library.bookmarks.map((bookmark) => (
                <article key={bookmark.id} className="rounded-2xl border px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-45">{bookmark.kind.replace(/_/g, " ")}</p>
                      <h2 className="mt-1 font-semibold">{bookmark.title}</h2>
                    </div>
                    <span className="text-[10px] opacity-45">{new Date(bookmark.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed opacity-80">{bookmark.content}</p>
                  {bookmark.note && <p className="mt-3 rounded-xl border px-3 py-2 text-xs"><strong>Note:</strong> {bookmark.note}</p>}
                  <Tags tags={bookmark.tags} />
                  {bookmark.citations.length > 0 && (
                    <details className="mt-3 text-xs opacity-70">
                      <summary className="cursor-pointer font-semibold">{bookmark.citations.length} references</summary>
                      <ul className="mt-2 space-y-1 pl-4">
                        {bookmark.citations.map((citation) => <li key={`${bookmark.id}-${citation.ordinal}`}>{citation.label}{citation.locator ? ` — ${citation.locator}` : ""}</li>)}
                      </ul>
                    </details>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                    <CollectionSelect value={bookmark.collectionId ?? ""} collections={library.collections} onChange={(value) => void moveItem("bookmark", bookmark.id, value)} label="Unfiled" compact />
                    <ActionButton label="Edit" disabled={busyId === bookmark.id} onClick={() => void editBookmark(bookmark)} />
                    <ActionButton label="Delete" disabled={busyId === bookmark.id} onClick={() => void remove("bookmark", bookmark.id)} />
                  </div>
                </article>
              ))}
            </div>
          )}

          {tab === "notes" && (
            <div className="mt-6 space-y-4">
              <details className="rounded-2xl border px-4 py-3" open={library.notes.length === 0}>
                <summary className="cursor-pointer text-sm font-semibold">Write a personal note</summary>
                <form onSubmit={createNote} className="mt-4 space-y-3">
                  <input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} maxLength={160} placeholder="Note title" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm" />
                  <textarea value={noteContent} onChange={(event) => setNoteContent(event.target.value)} rows={6} placeholder="Your study notes…" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={noteTags} onChange={(event) => setNoteTags(event.target.value)} placeholder="Tags separated by commas" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm" />
                    <CollectionSelect value={noteCollection} collections={library.collections} onChange={setNoteCollection} label="Unfiled" />
                  </div>
                  <PrimaryButton label="Save note" />
                </form>
              </details>

              {library.notes.length === 0 ? <Empty text="No notes match this view." /> : library.notes.map((note) => (
                <article key={note.id} className="rounded-2xl border px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{note.title}</h2>
                    <span className="text-[10px] opacity-45">{new Date(note.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed opacity-80">{note.content}</p>
                  <Tags tags={note.tags} />
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                    <CollectionSelect value={note.collectionId ?? ""} collections={library.collections} onChange={(value) => void moveItem("note", note.id, value)} label="Unfiled" compact />
                    <ActionButton label="Edit" disabled={busyId === note.id} onClick={() => void editNote(note)} />
                    <ActionButton label="Delete" disabled={busyId === note.id} onClick={() => void remove("note", note.id)} />
                  </div>
                </article>
              ))}
            </div>
          )}

          {tab === "collections" && (
            <div className="mt-6 space-y-4">
              <form onSubmit={createCollection} className="rounded-2xl border px-4 py-4">
                <h2 className="text-sm font-semibold">Create a collection</h2>
                <div className="mt-3 space-y-3">
                  <input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} maxLength={80} placeholder="Collection name" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm" />
                  <textarea value={collectionDescription} onChange={(event) => setCollectionDescription(event.target.value)} maxLength={300} rows={2} placeholder="Description (optional)" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm" />
                  <PrimaryButton label="Create collection" />
                </div>
              </form>
              {library.collections.length === 0 ? <Empty text="No collections yet." /> : library.collections.map((collection) => (
                <article key={collection.id} className="rounded-2xl border px-4 py-4">
                  <h2 className="font-semibold">{collection.name}</h2>
                  {collection.description && <p className="mt-1 text-sm opacity-65">{collection.description}</p>}
                  <p className="mt-2 text-xs opacity-50">{collection.bookmarkCount} bookmarks · {collection.noteCount} notes</p>
                  <div className="mt-3 flex gap-2 border-t pt-3">
                    <ActionButton label="Edit" disabled={busyId === collection.id} onClick={() => void editCollection(collection)} />
                    <ActionButton label="Delete" disabled={busyId === collection.id} onClick={() => void remove("collection", collection.id)} />
                  </div>
                </article>
              ))}
            </div>
          )}

          {tab === "import" && (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border px-4 py-4">
                <h2 className="text-sm font-semibold">Save an AI response</h2>
                <p className="mt-1 text-xs opacity-60">Choose a saved conversation, then bookmark an individual answer with its references.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <select value={selectedConversation} onChange={(event) => void openConversation(event.target.value)} className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm">
                    <option value="">Choose a conversation</option>
                    {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
                  </select>
                  <CollectionSelect value={importCollection} collections={library.collections} onChange={setImportCollection} label="Save as unfiled" />
                </div>
              </div>

              {busyId === selectedConversation ? (
                <div className="h-28 animate-pulse rounded-2xl border opacity-35" />
              ) : conversationMessages.length === 0 ? (
                <Empty text={selectedConversation ? "No assistant responses found in this conversation." : "Select a conversation to view its answers."} />
              ) : conversationMessages.map((message) => (
                <article key={message.id} className="rounded-2xl border px-4 py-4">
                  <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed opacity-80">{message.content}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
                    <span className="text-xs opacity-50">{message.citations.length} references</span>
                    <button type="button" disabled={busyId === message.id} onClick={() => void importMessage(message)} className="rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: "var(--tg-theme-button-color, var(--pine))", color: "var(--tg-theme-button-text-color, white)" }}>
                      {busyId === message.id ? "Saving…" : "Save response"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CollectionSelect({
  value,
  collections,
  onChange,
  label,
  compact = false,
}: {
  value: string;
  collections: BookmarkCollection[];
  onChange: (value: string) => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${compact ? "rounded-full px-3 py-1.5 text-xs" : "w-full rounded-xl px-3 py-2 text-sm"} border bg-transparent`}
    >
      <option value="">{label}</option>
      {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
    </select>
  );
}

function PrimaryButton({ label }: { label: string }) {
  return (
    <button type="submit" className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: "var(--tg-theme-button-color, var(--pine))", color: "var(--tg-theme-button-text-color, white)" }}>
      {label}
    </button>
  );
}

function ActionButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40">{label}</button>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border px-3 py-3 text-center">
      <p className="font-display text-xl">{value}</p>
      <p className="text-[10px] uppercase tracking-wide opacity-50">{label}</p>
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return <div className="mt-3 flex flex-wrap gap-1.5">{tags.map((tag) => <span key={tag} className="rounded-full border px-2 py-1 text-[10px] opacity-65">#{tag}</span>)}</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border px-4 py-5 text-sm opacity-60">{text}</div>;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
