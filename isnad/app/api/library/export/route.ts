import { NextRequest, NextResponse } from "next/server";
import { listKnowledgeLibrary } from "@/lib/libraryStore";
import type { KnowledgeLibrary } from "@/lib/libraryTypes";
import { recordEvent } from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";

function markdown(library: KnowledgeLibrary): string {
  const collectionNames = new Map(library.collections.map((item) => [item.id, item.name]));
  const lines = [
    "# Isnad Personal Knowledge Library",
    "",
    `Exported: ${new Date().toISOString()}`,
    "",
    "## Collections",
    "",
  ];

  if (library.collections.length === 0) {
    lines.push("No collections.", "");
  } else {
    for (const collection of library.collections) {
      lines.push(
        `- **${collection.name}** — ${collection.bookmarkCount} bookmarks, ${collection.noteCount} notes${collection.description ? ` — ${collection.description}` : ""}`
      );
    }
    lines.push("");
  }

  lines.push("## Bookmarks", "");
  if (library.bookmarks.length === 0) {
    lines.push("No bookmarks.", "");
  } else {
    for (const bookmark of library.bookmarks) {
      lines.push(
        `### ${bookmark.title}`,
        "",
        `- Type: ${bookmark.kind.replace(/_/g, " ")}`,
        `- Collection: ${bookmark.collectionId ? collectionNames.get(bookmark.collectionId) ?? "Unknown" : "Unfiled"}`,
        `- Saved: ${bookmark.createdAt}`
      );
      if (bookmark.tags.length) lines.push(`- Tags: ${bookmark.tags.join(", ")}`);
      if (bookmark.note) lines.push("", `> Personal note: ${bookmark.note.replace(/\n/g, " ")}`);
      lines.push("", bookmark.content, "");
      if (bookmark.citations.length) {
        lines.push("**References**", "");
        for (const citation of bookmark.citations) {
          lines.push(`- ${citation.label}${citation.locator ? ` — ${citation.locator}` : ""}`);
        }
        lines.push("");
      }
    }
  }

  lines.push("## Notes", "");
  if (library.notes.length === 0) {
    lines.push("No notes.", "");
  } else {
    for (const note of library.notes) {
      lines.push(
        `### ${note.title}`,
        "",
        `- Collection: ${note.collectionId ? collectionNames.get(note.collectionId) ?? "Unknown" : "Unfiled"}`,
        `- Updated: ${note.updatedAt}`
      );
      if (note.tags.length) lines.push(`- Tags: ${note.tags.join(", ")}`);
      lines.push("", note.content, "");
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function GET(request: NextRequest) {
  const session = await resolveTelegramSession(request, {
    required: true,
    requireDatabase: true,
  });
  if (!session || !session.ok) {
    return NextResponse.json(
      { error: session?.error ?? "Telegram authentication is required." },
      { status: session?.status ?? 401 }
    );
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Personal library is unavailable." }, { status: 503 });
  }

  const format = request.nextUrl.searchParams.get("format") === "json" ? "json" : "markdown";
  const library = await listKnowledgeLibrary(session.userId);
  await recordEvent("library_exported", session.userId, {
    format,
    bookmarkCount: library.bookmarks.length,
    noteCount: library.notes.length,
  });

  const date = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), library }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"isnad-library-${date}.json\"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new Response(markdown(library), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"isnad-library-${date}.md\"`,
      "Cache-Control": "private, no-store",
    },
  });
}
