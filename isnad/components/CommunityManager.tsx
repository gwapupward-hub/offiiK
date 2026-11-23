"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModuleEvaluation } from "@/lib/community/botPermissions";
import SourceReviewStudio from "@/components/SourceReviewStudio";
import type { CommunityView } from "@/lib/community/communityView";
import type { CommunitySettings } from "@/lib/community/settingsSchema";
import type { BotPermissionSnapshot, CommunityRole, ModuleKey } from "@/lib/community/types";

type AuthorizedFetch = (url: string, options?: RequestInit) => Promise<Response>;

type ListEntry = {
  id: string;
  title: string;
  chatType: CommunityView["chatType"];
  status: CommunityView["status"];
  roles: CommunityRole[];
  claimable: boolean;
};

type ClaimPreview = {
  communityId: string;
  title: string;
  chatType: CommunityView["chatType"];
  isForum: boolean;
  status: CommunityView["status"];
  telegramStatus?: string;
  ownership: "unclaimed" | "you" | "other";
  canRecoverOwnership: boolean;
  bot: BotPermissionSnapshot;
  modules: ModuleEvaluation[];
};

type RoleAssignment = {
  id: string;
  telegramUserId: number;
  displayName: string | null;
  username: string | null;
  role: CommunityRole;
  lastVerifiedStatus: string | null;
};

type AuditEvent = {
  id: string;
  action: string;
  actorDisplayName: string | null;
  createdAt: string;
};

type ApiFailure = { ok: false; status: number; code: string; message: string; extra: Record<string, unknown> };
type ApiResult<T> = { ok: true; data: T } | ApiFailure;

type Tab = "overview" | "modules" | "sources" | "security";
type Tone = "good" | "warn" | "bad" | "muted";

const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
  assistant: "Answers Islamic questions when someone mentions Isnad or replies to it.",
  verification: "Checks hadith attributions, Qur'anic quotations and claims on request.",
  publisher: "Publishes source-reviewed posts only after an administrator approves them.",
  learning: "Lessons, quiz polls and study circles, started manually by administrators.",
};

const ROLE_LABELS: Record<CommunityRole, string> = {
  owner: "Owner",
  community_manager: "Community manager",
  content_editor: "Content editor",
  source_reviewer: "Source reviewer",
  publisher: "Publisher",
  analytics_viewer: "Analytics viewer",
};

const PERMISSION_LABELS: [keyof BotPermissionSnapshot, string][] = [
  ["canSendMessages", "Send messages"],
  ["seesAllGroupMessages", "Receive @mentions"],
  ["canPostMessages", "Post messages"],
  ["canEditMessages", "Edit messages"],
  ["canSendPolls", "Send polls"],
  ["canPinMessages", "Pin messages"],
];

const DATA_HANDLING = [
  "Ordinary group messages are not stored. Only messages that explicitly trigger an enabled feature are processed.",
  "Triggered group interactions are kept for up to 30 days and are never mixed with members' private Isnad conversations.",
  "Administrator actions are recorded in an audit log without message content.",
  "Your Telegram administrator rights are re-checked on every change.",
];

const PUBLICATION_POLICY = [
  "Nothing is published without an administrator approving the exact revision.",
  "Scheduled posts stay off until you turn them on; a pause stops all publishing.",
  "Isnad provides educational guidance, not binding fatwas.",
];

function statusChip(status: CommunityView["status"]): { label: string; tone: Tone } {
  switch (status) {
    case "pending":
      return { label: "Not activated", tone: "warn" };
    case "active":
      return { label: "Active", tone: "good" };
    case "paused":
      return { label: "Paused", tone: "warn" };
    case "permission_lost":
      return { label: "Missing permissions", tone: "bad" };
    case "removed":
      return { label: "Bot removed", tone: "bad" };
  }
}

function moduleChip(module: ModuleEvaluation, status: CommunityView["status"]): { label: string; tone: Tone } {
  switch (module.state) {
    case "disabled":
      return { label: "Off", tone: "muted" };
    case "incompatible":
      return { label: "Not for channels", tone: "muted" };
    case "blocked_permissions":
      return { label: "Missing permissions", tone: "bad" };
    case "paused":
      return { label: status === "pending" ? "Awaiting activation" : "Paused", tone: "warn" };
    case "awaiting_release":
      return { label: "Configured · ships later", tone: "warn" };
    case "ready":
      return { label: "Running", tone: "good" };
  }
}

function chatTypeLabel(chatType: CommunityView["chatType"]): string {
  return chatType === "channel" ? "Channel" : chatType === "supergroup" ? "Supergroup" : "Group";
}

function Chip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className="cm-chip" data-tone={tone}>
      {label}
    </span>
  );
}

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="cm-check" data-ok={ok}>
      <span aria-hidden="true" className="cm-check-mark">
        {ok ? "✓" : "✕"}
      </span>
      <span>
        <span className="sr-only">{ok ? "Granted: " : "Missing: "}</span>
        {label}
        {hint ? <span className="cm-check-hint">{hint}</span> : null}
      </span>
    </li>
  );
}

function auditLabel(action: string): string {
  const words = action.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function idempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function CommunityManager({
  authenticated,
  authorizedFetch,
  startParam,
  onHaptic,
}: {
  authenticated: boolean;
  authorizedFetch: AuthorizedFetch;
  startParam: string | null;
  onHaptic?: (kind: "success" | "error" | "selection") => void;
}) {
  const [screen, setScreen] = useState<"list" | "claim" | "detail">(
    startParam?.startsWith("cm_") ? "claim" : "list"
  );
  const [communities, setCommunities] = useState<ListEntry[]>([]);
  const [unverified, setUnverified] = useState(0);
  const [preview, setPreview] = useState<ClaimPreview | null>(null);
  const [view, setView] = useState<CommunityView | null>(null);
  const [draft, setDraft] = useState<CommunitySettings | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [roles, setRoles] = useState<RoleAssignment[] | null>(null);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [grantUserId, setGrantUserId] = useState("");
  const [grantRole, setGrantRole] = useState<CommunityRole>("community_manager");

  const call = useCallback(
    async <T,>(url: string, init: RequestInit = {}, mutation = false): Promise<ApiResult<T>> => {
      const headers = new Headers(init.headers);
      if (init.body) headers.set("Content-Type", "application/json");
      if (mutation) headers.set("Idempotency-Key", idempotencyKey());
      try {
        const response = await authorizedFetch(url, { ...init, headers, cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const failure = (data?.error ?? {}) as Record<string, unknown>;
          return {
            ok: false,
            status: response.status,
            code: typeof failure.code === "string" ? failure.code : "unknown",
            message: typeof failure.message === "string" ? failure.message : "Something went wrong.",
            extra: failure,
          };
        }
        return { ok: true, data: data as T };
      } catch {
        return { ok: false, status: 0, code: "network", message: "Couldn't reach Isnad. Check your connection.", extra: {} };
      }
    },
    [authorizedFetch]
  );

  const applyView = useCallback((next: CommunityView) => {
    setView(next);
    setDraft(structuredClone({
      assistant: next.settings.assistant,
      verification: next.settings.verification,
      publisher: next.settings.publisher,
      learning: next.settings.learning,
    }));
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await call<{ communities: ListEntry[]; unverified: number }>("/api/v1/communities");
    if (result.ok) {
      setCommunities(result.data.communities);
      setUnverified(result.data.unverified);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [call]);

  const openCommunity = useCallback(
    async (id: string) => {
      setLoading(true);
      setError("");
      setNotice("");
      setRoles(null);
      setAudit(null);
      const result = await call<{ community: CommunityView }>(`/api/v1/communities/${id}`);
      if (result.ok) {
        applyView(result.data.community);
        setTab("overview");
        setScreen("detail");
      } else {
        setError(result.message);
      }
      setLoading(false);
    },
    [applyView, call]
  );

  const loadPreview = useCallback(
    async (body: Record<string, unknown>) => {
      setLoading(true);
      setError("");
      const result = await call<{ preview: ClaimPreview }>("/api/v1/communities/claim", {
        method: "POST",
        body: JSON.stringify({ ...body, confirm: false }),
      });
      if (result.ok) {
        setPreview(result.data.preview);
        setScreen("claim");
      } else {
        setError(result.message);
        setScreen("list");
        void loadList();
      }
      setLoading(false);
    },
    [call, loadList]
  );

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    // Defer the initial load out of the effect body (avoids cascading renders).
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (startParam?.startsWith("cm_")) return loadPreview({ nonce: startParam });
      return loadList();
    });
    return () => {
      cancelled = true;
    };
  }, [authenticated, loadList, loadPreview, startParam]);

  useEffect(() => {
    if (screen !== "detail" || tab !== "security" || !view) return;
    const canSeeAudit = view.viewer.capabilities.includes("audit.view");
    if (!canSeeAudit) return;
    let cancelled = false;
    void Promise.all([
      call<{ assignments: RoleAssignment[] }>(`/api/v1/communities/${view.id}/roles`),
      call<{ events: AuditEvent[] }>(`/api/v1/communities/${view.id}/audit?limit=30`),
    ]).then(([rolesResult, auditResult]) => {
      if (cancelled) return;
      if (rolesResult.ok) setRoles(rolesResult.data.assignments);
      if (auditResult.ok) setAudit(auditResult.data.events);
    });
    return () => {
      cancelled = true;
    };
  }, [call, screen, tab, view]);

  const dirty = useMemo(() => {
    if (!view || !draft) return false;
    return (["assistant", "verification", "publisher", "learning"] as ModuleKey[]).some(
      (key) => JSON.stringify(view.settings[key]) !== JSON.stringify(draft[key])
    );
  }, [draft, view]);

  async function confirmClaim(recoverOwnership = false) {
    if (!preview) return;
    setBusy(true);
    setError("");
    const body = startParam?.startsWith("cm_")
      ? { nonce: startParam, confirm: true, recoverOwnership }
      : { communityId: preview.communityId, confirm: true, recoverOwnership };
    const result = await call<{ communityId: string }>(
      "/api/v1/communities/claim",
      { method: "POST", body: JSON.stringify(body) },
      true
    );
    setBusy(false);
    if (!result.ok) {
      onHaptic?.("error");
      setError(result.message);
      return;
    }
    onHaptic?.("success");
    await openCommunity(result.data.communityId);
    setNotice("Connected. Review the modules, then activate when you're ready.");
  }

  async function mutate(path: string, body: Record<string, unknown>, success: string, method = "POST") {
    if (!view) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await call<{ community: CommunityView; resumed?: boolean }>(
      `/api/v1/communities/${view.id}${path}`,
      { method, body: JSON.stringify(body) },
      true
    );
    setBusy(false);
    if (!result.ok) {
      onHaptic?.("error");
      if (result.code === "version_conflict") {
        await openCommunity(view.id);
        setError("Settings changed elsewhere. The latest version has been loaded — review and try again.");
        return;
      }
      if (result.code === "missing_permissions" && Array.isArray(result.extra.modules)) {
        setError(`${result.message} (${(result.extra.modules as { missing: string[] }[]).flatMap((m) => m.missing).join(", ")})`);
        return;
      }
      setError(result.message);
      return;
    }
    onHaptic?.("success");
    applyView(result.data.community);
    if (result.data.resumed === false) setError("Isnad can't resume yet: the bot is missing permissions an enabled module needs.");
    else setNotice(success);
    setAudit(null);
  }

  async function recheckPermissions() {
    if (!view) return;
    setBusy(true);
    setError("");
    const result = await call<{ community: CommunityView }>(`/api/v1/communities/${view.id}/permissions`);
    setBusy(false);
    if (result.ok) {
      applyView(result.data.community);
      setNotice("Permissions re-checked with Telegram.");
    } else {
      setError(result.message);
    }
  }

  async function updateRoles(method: "POST" | "DELETE", path: string, body?: Record<string, unknown>) {
    if (!view) return;
    setBusy(true);
    setError("");
    const result = await call<{ assignments: RoleAssignment[] }>(
      `/api/v1/communities/${view.id}/roles${path}`,
      { method, body: body ? JSON.stringify(body) : undefined },
      method === "POST"
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRoles(result.data.assignments);
    setGrantUserId("");
    setNotice(method === "POST" ? "Role granted." : "Role revoked.");
  }

  function setModuleField<K extends ModuleKey>(key: K, field: keyof CommunitySettings[K], value: unknown) {
    setDraft((current) => (current ? { ...current, [key]: { ...current[key], [field]: value } } : current));
  }

  if (!authenticated) {
    return (
      <section className="telegram-density-shell">
        <div className="telegram-account-empty">Open the Community Manager from Telegram to verify your administrator rights.</div>
      </section>
    );
  }

  const banner = (
    <>
      {error ? (
        <div className="telegram-error-banner" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="cm-notice" role="status">
          {notice}
        </p>
      ) : null}
    </>
  );

  if (loading && !view && !preview && communities.length === 0) {
    return <div className="telegram-skeleton-card h-36" aria-label="Loading Community Manager" />;
  }

  // ---------------------------------------------------------------- claim
  if (screen === "claim" && preview) {
    const ownedByOther = preview.ownership === "other";
    return (
      <section className="telegram-density-shell">
        <div className="cm-intro">
          <p className="telegram-screen-kicker">Step 1 of 3 · Confirm</p>
          <h1>Connect this community?</h1>
          <p>Telegram confirmed your administrator rights. Check that this is the community you want Isnad to manage.</p>
        </div>
        {banner}
        <div className="telegram-compact-card cm-stack">
          <div className="cm-title-row">
            <h2>{preview.title || "Untitled chat"}</h2>
            <Chip label={chatTypeLabel(preview.chatType)} tone="muted" />
          </div>
          <ul className="cm-checks">
            <Check ok label={`You are ${preview.telegramStatus === "creator" ? "the owner" : "an administrator"} in Telegram`} />
            <Check
              ok={preview.bot.isAdministrator || preview.bot.canSendMessages}
              label={`Isnad is ${preview.bot.isAdministrator ? "an administrator" : "a member"} of this ${preview.chatType === "channel" ? "channel" : "group"}`}
            />
            {preview.isForum ? <Check ok label="Forum topics detected — replies will stay in their topic" /> : null}
          </ul>
        </div>

        <h3 className="cm-section-label">Bot permissions</h3>
        <ul className="telegram-compact-card cm-checks">
          {PERMISSION_LABELS.filter(([key]) => preview.chatType === "channel" ? key !== "seesAllGroupMessages" : key !== "canPostMessages").map(([key, label]) => (
            <Check key={key} ok={preview.bot[key] === true} label={label} />
          ))}
        </ul>

        <h3 className="cm-section-label">Modules for this {preview.chatType === "channel" ? "channel" : "group"}</h3>
        <ul className="telegram-compact-card cm-checks">
          {preview.modules.map((module) => (
            <Check
              key={module.key}
              ok={module.compatibility !== "incompatible" && module.missingPermissions.length === 0}
              label={module.label}
              hint={
                module.compatibility === "incompatible"
                  ? "Not available here — turned off automatically"
                  : module.compatibility === "mini_app_only"
                    ? "From the Mini App only"
                    : module.missingPermissions.length
                      ? `Needs: ${module.missingPermissions.join(", ")}`
                      : undefined
              }
            />
          ))}
        </ul>

        <div className="cm-actions">
          {ownedByOther ? (
            <>
              <p className="cm-muted">Another administrator already manages this community in Isnad. Ask them to grant you a role.</p>
              {preview.canRecoverOwnership ? (
                <button type="button" className="telegram-primary-button" disabled={busy} onClick={() => void confirmClaim(true)}>
                  Recover ownership as chat owner
                </button>
              ) : null}
            </>
          ) : (
            <button type="button" className="telegram-primary-button cm-wide" disabled={busy} onClick={() => void confirmClaim()}>
              {busy ? "Connecting…" : preview.ownership === "you" ? "Continue to settings" : "Confirm and continue"}
            </button>
          )}
          <button type="button" className="cm-link-button" onClick={() => { setScreen("list"); void loadList(); }}>
            Not this community
          </button>
        </div>
        <p className="cm-muted">Nothing is activated yet. Isnad stays silent in this community until you review the settings and activate it.</p>
      </section>
    );
  }

  // --------------------------------------------------------------- detail
  if (screen === "detail" && view && draft) {
    const can = (capability: string) => view.viewer.capabilities.includes(capability as never);
    const chip = statusChip(view.status);
    const enabledModules = view.modules.filter((module) => module.enabled && module.compatibility !== "incompatible");

    return (
      <section className="telegram-density-shell">
        <button type="button" className="cm-link-button cm-back" onClick={() => { setView(null); setScreen("list"); void loadList(); }}>
          ‹ All communities
        </button>
        <div className="cm-title-row">
          <h1 className="cm-heading">{view.title || "Untitled chat"}</h1>
          <Chip label={chip.label} tone={chip.tone} />
        </div>
        <p className="cm-muted">
          {chatTypeLabel(view.chatType)}
          {view.isForum ? " · Forum topics" : ""} · Your access: {view.viewer.roles.map((role) => ROLE_LABELS[role]).join(", ") || "None"}
        </p>
        {view.globalPause ? (
          <div className="telegram-error-banner" role="status">
            Isnad operators have paused all community automation. Settings remain editable.
          </div>
        ) : null}
        {banner}

        <div className="cm-tabs" role="tablist" aria-label="Community sections">
          {(["overview", "modules", ...(can("content.edit") || can("content.review") ? ["sources"] : []), "security"] as Tab[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              data-active={tab === item}
              onClick={() => {
                onHaptic?.("selection");
                setTab(item);
              }}
            >
              {item === "overview" ? "Overview" : item === "modules" ? "Modules" : item === "sources" ? "Sources" : "Security"}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="cm-stack">
            <div className="telegram-compact-card cm-stack">
              <h2>Status</h2>
              <p className="cm-body">
                {view.status === "pending"
                  ? "Connected but not activated. Isnad stays silent here until you activate it below."
                  : view.status === "active"
                    ? "Active. Each module starts working when its release ships; until then Isnad stays silent in this community."
                    : view.status === "paused"
                      ? `Paused${view.pauseReason ? ` — ${view.pauseReason}` : ""}. No replies, publishing or learning announcements are sent.`
                      : view.status === "permission_lost"
                        ? "Paused automatically because the bot lost a permission an enabled module needs. Fix it in Telegram, then resume."
                        : "Isnad was removed from this chat. Add the bot again to reconnect."}
              </p>
            </div>

            {view.status === "pending" ? (
              <div className="telegram-compact-card cm-stack">
                <p className="telegram-screen-kicker">Step 3 of 3 · Review & activate</p>
                <h2>Ready to activate?</h2>
                <h3 className="cm-section-label">Configured features</h3>
                <ul className="cm-bullets">
                  {enabledModules.length ? (
                    enabledModules.map((module) => <li key={module.key}>{module.label}</li>)
                  ) : (
                    <li>No modules enabled</li>
                  )}
                </ul>
                <h3 className="cm-section-label">Required permissions</h3>
                {view.activation.blockers.length ? (
                  <ul className="cm-checks">
                    {view.activation.blockers.map((blocker) => (
                      <Check key={blocker} ok={false} label={blocker} />
                    ))}
                  </ul>
                ) : (
                  <ul className="cm-checks">
                    <Check ok label="The bot has every permission the enabled modules need" />
                  </ul>
                )}
                <h3 className="cm-section-label">How data is handled</h3>
                <ul className="cm-bullets">
                  {DATA_HANDLING.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <h3 className="cm-section-label">Publication policy</h3>
                <ul className="cm-bullets">
                  {PUBLICATION_POLICY.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {can("community.activate") ? (
                  <button
                    type="button"
                    className="telegram-primary-button cm-wide"
                    disabled={busy || !view.activation.ready || dirty}
                    onClick={() => void mutate("/activate", { settingsVersion: view.settings.version }, "Community activated.")}
                  >
                    {dirty ? "Save module changes first" : busy ? "Activating…" : "Activate Isnad in this community"}
                  </button>
                ) : (
                  <p className="cm-muted">Only the owner can activate this community.</p>
                )}
              </div>
            ) : null}

            <div className="telegram-compact-card cm-stack">
              <div className="cm-title-row">
                <h2>Bot permissions</h2>
                <button type="button" className="cm-link-button" disabled={busy} onClick={() => void recheckPermissions()}>
                  Re-check
                </button>
              </div>
              <ul className="cm-checks">
                {PERMISSION_LABELS.filter(([key]) => view.chatType === "channel" ? key !== "seesAllGroupMessages" : key !== "canPostMessages").map(([key, label]) => (
                  <Check key={key} ok={view.bot.permissions[key] === true} label={label} />
                ))}
              </ul>
              <p className="cm-muted">
                Last checked {view.bot.checkedAt ? new Date(view.bot.checkedAt).toLocaleString() : "never"}.
              </p>
            </div>
          </div>
        ) : null}

        {tab === "modules" ? (
          <div className="cm-stack">
            <p className="cm-muted">
              {view.status === "pending" ? "Step 2 of 3 · " : ""}Choose what Isnad may do here. Modules you enable stay inactive until the community is activated and each module&apos;s release ships.
            </p>
            {view.modules.map((module) => {
              const moduleChipInfo = moduleChip(module, view.status);
              const incompatible = module.compatibility === "incompatible";
              const editable = can("settings.update") && !incompatible;
              const key = module.key;
              return (
                <div key={key} className="telegram-compact-card cm-stack" data-module={key}>
                  <div className="cm-title-row">
                    <div className="min-w-0">
                      <h2>{module.label}</h2>
                      <Chip label={moduleChipInfo.label} tone={moduleChipInfo.tone} />
                    </div>
                    <label className="cm-switch-label">
                      <input
                        type="checkbox"
                        className="telegram-switch-input"
                        checked={!incompatible && draft[key].enabled}
                        disabled={!editable || busy}
                        onChange={(event) => setModuleField(key, "enabled", event.target.checked)}
                        aria-label={`Enable ${module.label}`}
                      />
                      <span className="telegram-switch" aria-hidden="true" />
                    </label>
                  </div>
                  <p className="cm-body">{MODULE_DESCRIPTIONS[key]}</p>
                  {module.missingPermissions.length ? (
                    <p className="cm-warning">Needs bot permission: {module.missingPermissions.join(", ")}</p>
                  ) : null}

                  {key === "assistant" && !incompatible && draft.assistant.enabled ? (
                    <div className="cm-fields">
                      <label className="cm-field">
                        <span>Responds to</span>
                        <select
                          className="telegram-select"
                          value={draft.assistant.responseMode}
                          disabled={!editable}
                          onChange={(event) => setModuleField("assistant", "responseMode", event.target.value)}
                        >
                          <option value="mention_only">Mentions only</option>
                          <option value="mention_and_reply">Mentions & replies</option>
                        </select>
                      </label>
                      <label className="cm-field">
                        <span>Answer length</span>
                        <select
                          className="telegram-select"
                          value={draft.assistant.answerLength}
                          disabled={!editable}
                          onChange={(event) => setModuleField("assistant", "answerLength", event.target.value)}
                        >
                          <option value="concise">Concise</option>
                          <option value="balanced">Balanced</option>
                          <option value="detailed">Detailed</option>
                        </select>
                      </label>
                      <label className="cm-field">
                        <span>Replies per hour</span>
                        <select
                          className="telegram-select"
                          value={draft.assistant.maxRepliesPerHour}
                          disabled={!editable}
                          onChange={(event) => setModuleField("assistant", "maxRepliesPerHour", Number(event.target.value))}
                        >
                          {[10, 20, 30, 60, 120].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <ToggleRow
                        label="Show sources"
                        checked={draft.assistant.showSources}
                        disabled={!editable}
                        onChange={(value) => setModuleField("assistant", "showSources", value)}
                      />
                    </div>
                  ) : null}
                  {key === "verification" && draft.verification.enabled ? (
                    <div className="cm-fields">
                      <ToggleRow
                        label="Show evidence with each result"
                        checked={draft.verification.showEvidence}
                        disabled={!editable}
                        onChange={(value) => setModuleField("verification", "showEvidence", value)}
                      />
                      <ToggleRow
                        label="Flag uncertain items for scholarly review"
                        checked={draft.verification.flagForScholarlyReview}
                        disabled={!editable}
                        onChange={(value) => setModuleField("verification", "flagForScholarlyReview", value)}
                      />
                    </div>
                  ) : null}
                  {key === "publisher" && draft.publisher.enabled ? (
                    <div className="cm-fields">
                      <ToggleRow label="Administrator approval required" checked disabled hint="Always on" onChange={() => undefined} />
                      <ToggleRow
                        label="Allow scheduled posts"
                        checked={draft.publisher.scheduledPostsEnabled}
                        disabled={!editable}
                        onChange={(value) => setModuleField("publisher", "scheduledPostsEnabled", value)}
                      />
                    </div>
                  ) : null}
                  {key === "learning" && draft.learning.enabled ? (
                    <div className="cm-fields">
                      <ToggleRow label="Started manually by administrators" checked disabled hint="Always on" onChange={() => undefined} />
                      <ToggleRow
                        label="Quiz polls"
                        checked={draft.learning.quizzesEnabled}
                        disabled={!editable}
                        onChange={(value) => setModuleField("learning", "quizzesEnabled", value)}
                      />
                      <ToggleRow
                        label="Public rankings (members opt in)"
                        checked={draft.learning.publicRankings}
                        disabled={!editable}
                        onChange={(value) => setModuleField("learning", "publicRankings", value)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
            {can("settings.update") ? (
              <div className="cm-save-bar">
                <button
                  type="button"
                  className="telegram-primary-button cm-wide"
                  disabled={!dirty || busy}
                  onClick={() =>
                    void mutate(
                      "/settings",
                      {
                        version: view.settings.version,
                        assistant: draft.assistant,
                        verification: draft.verification,
                        publisher: draft.publisher,
                        learning: draft.learning,
                      },
                      "Settings saved.",
                      "PATCH"
                    )
                  }
                >
                  {busy ? "Saving…" : dirty ? "Save changes" : "No unsaved changes"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "sources" ? (
          <SourceReviewStudio communityId={view.id} authorizedFetch={authorizedFetch} canEdit={can("content.edit")} canReview={can("content.review")} />
        ) : null}

        {tab === "security" ? (
          <div className="cm-stack">
            <div className="telegram-compact-card cm-stack">
              <h2>Emergency control</h2>
              {view.status === "paused" || view.status === "permission_lost" ? (
                <>
                  <p className="cm-body">Resuming re-checks the bot&apos;s permissions with Telegram first.</p>
                  <button
                    type="button"
                    className="telegram-primary-button cm-wide"
                    disabled={busy || !can("community.resume")}
                    onClick={() => void mutate("/resume", {}, "Isnad resumed after a fresh permission check.")}
                  >
                    Resume Isnad
                  </button>
                </>
              ) : view.status !== "removed" ? (
                <>
                  <p className="cm-body">Pausing immediately stops AI replies, scheduled publishing and learning announcements. Settings and the audit log stay available.</p>
                  <input
                    className="telegram-text-field"
                    placeholder="Reason (optional)"
                    maxLength={280}
                    value={pauseReason}
                    onChange={(event) => setPauseReason(event.target.value)}
                    aria-label="Pause reason"
                  />
                  <button
                    type="button"
                    className="telegram-primary-button cm-wide cm-danger"
                    disabled={busy || !can("community.pause")}
                    onClick={() => void mutate("/pause", { reason: pauseReason.trim() || undefined }, "Isnad is paused in this community.")}
                  >
                    Pause Isnad here
                  </button>
                </>
              ) : (
                <p className="cm-body">Isnad is not in this chat.</p>
              )}
              {!can("community.pause") ? <p className="cm-muted">Pausing needs the owner or community manager role and current Telegram admin rights.</p> : null}
            </div>

            <div className="telegram-compact-card cm-stack">
              <h2>Your access</h2>
              <ul className="cm-checks">
                <Check ok={view.viewer.telegramStatus === "creator" || view.viewer.telegramStatus === "administrator"} label={`Telegram: ${view.viewer.telegramStatus}`} />
                <Check ok={view.viewer.roles.length > 0} label={`Isnad: ${view.viewer.roles.map((role) => ROLE_LABELS[role]).join(", ") || "no role"}`} />
              </ul>
            </div>

            {can("audit.view") ? (
              <>
                <div className="telegram-compact-card cm-stack">
                  <h2>Roles</h2>
                  {roles === null ? (
                    <p className="cm-muted">Loading…</p>
                  ) : (
                    <ul className="cm-list">
                      {roles.map((assignment) => (
                        <li key={assignment.id} className="cm-list-row">
                          <span className="min-w-0">
                            <strong>{assignment.displayName ?? `User ${assignment.telegramUserId}`}</strong>
                            <span className="cm-muted"> · {ROLE_LABELS[assignment.role]}</span>
                          </span>
                          {assignment.role !== "owner" && can("roles.manage") ? (
                            <button
                              type="button"
                              className="cm-link-button cm-danger-text"
                              disabled={busy}
                              onClick={() => void updateRoles("DELETE", `/${assignment.id}`)}
                            >
                              Revoke
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {can("roles.manage") ? (
                    <form
                      className="cm-fields"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const id = Number(grantUserId.trim());
                        if (!Number.isSafeInteger(id) || id <= 0) {
                          setError("Enter the person's numeric Telegram user id.");
                          return;
                        }
                        void updateRoles("POST", "", { telegramUserId: id, role: grantRole });
                      }}
                    >
                      <label className="cm-field">
                        <span>Telegram user id</span>
                        <input
                          className="telegram-text-field"
                          inputMode="numeric"
                          value={grantUserId}
                          onChange={(event) => setGrantUserId(event.target.value)}
                        />
                      </label>
                      <label className="cm-field">
                        <span>Role</span>
                        <select className="telegram-select" value={grantRole} onChange={(event) => setGrantRole(event.target.value as CommunityRole)}>
                          {(Object.keys(ROLE_LABELS) as CommunityRole[])
                            .filter((role) => role !== "owner")
                            .map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button type="submit" className="telegram-primary-button" disabled={busy || !grantUserId.trim()}>
                        Grant role
                      </button>
                      <p className="cm-muted">Roles never replace Telegram rights: high-impact actions also need current admin status in the chat.</p>
                    </form>
                  ) : null}
                </div>

                <div className="telegram-compact-card cm-stack">
                  <h2>Audit log</h2>
                  {audit === null ? (
                    <p className="cm-muted">Loading…</p>
                  ) : audit.length === 0 ? (
                    <p className="cm-muted">No events yet.</p>
                  ) : (
                    <ul className="cm-list">
                      {audit.map((event) => (
                        <li key={event.id} className="cm-list-row cm-audit-row">
                          <span className="min-w-0">
                            <strong>{auditLabel(event.action)}</strong>
                            <span className="cm-muted"> · {event.actorDisplayName ?? "Telegram"}</span>
                          </span>
                          <time className="cm-muted" dateTime={event.createdAt}>
                            {new Date(event.createdAt).toLocaleString()}
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  // ----------------------------------------------------------------- list
  return (
    <section className="telegram-density-shell">
      <div className="cm-intro">
        <p className="telegram-screen-kicker">Admin Control Center</p>
        <h1>Your communities</h1>
        <p>Groups and channels you administer with Isnad. Telegram rights are verified live each time.</p>
      </div>
      {banner}
      {unverified > 0 ? (
        <p className="cm-muted">{unverified} communit{unverified === 1 ? "y" : "ies"} couldn&apos;t be verified with Telegram right now.</p>
      ) : null}
      {communities.length > 0 ? (
        <div className="telegram-card-stack">
          {communities.map((community) => {
            const chip = community.claimable ? { label: "Ready to connect", tone: "warn" as Tone } : statusChip(community.status);
            return (
              <button
                key={community.id}
                type="button"
                className="telegram-compact-card cm-community-card"
                onClick={() => (community.claimable ? void loadPreview({ communityId: community.id }) : void openCommunity(community.id))}
              >
                <span className="cm-title-row">
                  <strong>{community.title || "Untitled chat"}</strong>
                  <Chip label={chip.label} tone={chip.tone} />
                </span>
                <span className="cm-muted">
                  {chatTypeLabel(community.chatType)}
                  {community.roles.length ? ` · ${community.roles.map((role) => ROLE_LABELS[role]).join(", ")}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      ) : !loading ? (
        <div className="telegram-compact-card cm-stack">
          <h2>Connect a community</h2>
          <ol className="cm-steps">
            <li>Add Isnad to your group or channel.</li>
            <li>In a group, send <code>/setup</code>. For a channel, return here after adding the bot.</li>
            <li>Confirm the community, review modules, then activate.</li>
          </ol>
          <p className="cm-muted">Isnad stays silent in a community until an administrator activates it.</p>
        </div>
      ) : null}
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="cm-toggle-row">
      <span>
        {label}
        {hint ? <span className="cm-check-hint">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        className="telegram-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="telegram-switch" aria-hidden="true" />
    </label>
  );
}
