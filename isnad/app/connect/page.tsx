import type { Metadata } from "next";
import Link from "next/link";
import { tools } from "@/lib/mcp/registry";

export const metadata: Metadata = {
  title: "Connect Isnad",
  description: "Connect Isnad's Islamic educational methodology to compatible AI applications.",
  robots: { index: false, follow: false },
};

const platforms = [
  { name: "ChatGPT", detail: "Use a custom MCP connection where your account and workspace permit it. Public app availability requires separate review.", href: "https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt" },
  { name: "Claude", detail: "Add a custom remote connector from the connector settings, subject to your account's permissions.", href: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" },
  { name: "Other MCP clients", detail: "Configure a remote Streamable HTTP MCP server in a compatible client. Individual skill packages are planned.", href: "https://modelcontextprotocol.io/" },
];

export default function ConnectPage() {
  return (
    <main className="min-h-screen bg-[#050806] text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-white/10 px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Isnad home"><span className="isnad-mark" aria-hidden="true"><span /></span><span className="font-display text-xl">Isnad</span></Link>
        <Link href="/ask" className="rounded-full border border-[#d6b35b]/40 px-4 py-2 text-sm text-[#f3d98f]">Ask Isnad</Link>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8dd8b8]">Isnad MCP · Development preview</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl tracking-tight sm:text-6xl">Islamic knowledge.<br /><span className="text-[#f3d98f]">In your own AI chat.</span></h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-white/75">Nine educational expert modules, one shared methodology. Designed to bring Isnad’s evidence hierarchy and scholarly boundaries to compatible AI applications.</p>
        <section aria-labelledby="connection-status" className="mt-10 rounded-2xl border border-[#d6b35b]/30 bg-[#d6b35b]/5 p-5 sm:p-7">
          <h2 id="connection-status" className="text-xl font-semibold">Public access is not available yet</h2>
          <p className="mt-2 text-sm leading-6 text-white/75">The proposed connection address is shown for planning only. Installation, downloads and public activation are disabled pending review and compatibility verification.</p>
          <code className="mt-4 block break-all rounded-xl bg-black/40 p-4 text-sm text-[#f3d98f]">https://mcp.isnadsunnah.site/mcp</code>
          <p className="mt-3 text-xs text-white/65">Not a live connection link. No account credentials or personal questions are needed to retrieve a skill.</p>
        </section>
        <section aria-labelledby="platforms" className="mt-12">
          <h2 id="platforms" className="text-2xl font-semibold">Connect your AI application</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {platforms.map(platform => <article key={platform.name} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h3 className="font-semibold">{platform.name}</h3><p className="mt-3 text-sm leading-6 text-white/75">{platform.detail}</p>
              <a className="mt-4 inline-block text-sm text-[#8dd8b8] underline underline-offset-4" href={platform.href}>Official setup documentation</a>
            </article>)}
          </div>
        </section>
        <section aria-labelledby="experts" className="mt-12">
          <h2 id="experts" className="text-2xl font-semibold">Explore the nine expert modules</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map(tool => <article key={tool.name} className="rounded-xl border border-white/10 p-4"><h3 className="font-medium">{tool.title}</h3><code className="mt-2 block break-all text-xs text-white/65">{tool.name}</code></article>)}
          </div>
        </section>
        <section className="mt-12 border-t border-white/10 pt-6 text-sm leading-7 text-white/70">
          <h2 className="font-semibold text-white">Educational guidance, not a binding fatwa</h2>
          <p>The external AI remains responsible for verifying citations, acknowledging uncertainty, respecting host policies and referring high-stakes matters to qualified authorities. Skill delivery does not authenticate sources or generate answers on Isnad’s servers.</p>
        </section>
      </div>
    </main>
  );
}
