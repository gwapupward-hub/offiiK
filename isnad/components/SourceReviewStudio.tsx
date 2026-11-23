"use client";

import { useCallback, useEffect, useState } from "react";

type Source = {
  id: string; sourceType: string; work: string; locator: string;
  edition: string; canonicalText: string; reviewStatus: "pending"|"approved"|"revoked";
  sourceVersion: string; sourceUrl: string|null;
};
type SourceDraft = {
  sourceType: "quran"|"hadith"|"scholarship"; work: string; locator: string;
  edition: string; canonicalText: string; language: "ar"|"en";
  sourceVersion: string; sourceUrl: string; licenseNotice: string;
  provider: string; citation: string; rightsBasis: string;
};
const initial: SourceDraft = {
  sourceType:"hadith", work:"", locator:"", edition:"", canonicalText:"",
  language:"ar", sourceVersion:"v1", sourceUrl:"", licenseNotice:"",
  provider:"", citation:"", rightsBasis:"",
};

function idempotencyKey(): string {
  return crypto.randomUUID();
}

/** Community-scoped editorial workflow; review actions require signed Telegram identity. */
export default function SourceReviewStudio({
  communityId, authorizedFetch, canEdit, canReview,
}: {
  communityId: string;
  authorizedFetch: (url:string, options?:RequestInit)=>Promise<Response>;
  canEdit:boolean; canReview:boolean;
}) {
  const [sources,setSources] = useState<Source[]>([]);
  const [draft,setDraft] = useState<SourceDraft>(initial);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");

  const endpoint="/api/v1/communities/"+communityId+"/sources";
  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const response=await authorizedFetch(endpoint);
      const json=await response.json();
      if(!response.ok) throw Error(json?.error?.message ?? "Unable to load sources.");
      setSources(json.sources ?? []);
    } catch(e) { setError(e instanceof Error?e.message:"Source list unavailable."); }
    finally {setLoading(false);}
  },[authorizedFetch,endpoint]);

  useEffect(()=>{void Promise.resolve().then(load);},[load]);

  function field<K extends keyof SourceDraft>(key:K,value:SourceDraft[K]){
    setDraft(previous=>({...previous,[key]:value}));
  }

  async function send(url:string,body:Record<string,unknown>) {
    const response=await authorizedFetch(url,{
      method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":idempotencyKey()},
      body:JSON.stringify(body),
    });
    const json=await response.json().catch(()=>({}));
    if(!response.ok) {
      const issues=Array.isArray(json?.error?.issues)?json.error.issues.join(" "):"";
      throw Error([json?.error?.message ?? "Request rejected.",issues].filter(Boolean).join(" "));
    }
    return json;
  }

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canEdit||busy)return;
    setBusy(true);setError("");setMessage("");
    try {
      await send(endpoint,{
        sourceType:draft.sourceType,work:draft.work,locator:draft.locator,
        edition:draft.edition,canonicalText:draft.canonicalText,language:draft.language,
        sourceVersion:draft.sourceVersion,sourceUrl:draft.sourceUrl.trim()||null,
        licenseNotice:draft.licenseNotice,
        provenance:{provider:draft.provider,citation:draft.citation,rightsBasis:draft.rightsBasis},
      });
      setDraft(initial);
      setMessage("Submitted as pending. A different authorized reviewer must approve this record.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Submission failed.");}
    finally{setBusy(false);}
  }

  async function review(id:string,decision:"approve"|"revoke"){
    if(!canReview||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      await send(endpoint+"/"+id+"/review",{decision});
      setMessage(decision==="approve"?"Source text approved for exact matching. No hadith grade was assigned.":"Source revoked from future matching.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Review failed.");}
    finally{setBusy(false);}
  }

  if(!canEdit&&!canReview) return <p className="cm-muted">Source management requires an editor or reviewer role.</p>;
  return <div className="cm-stack">
    <div className="telegram-compact-card cm-stack">
      <h2>Evidence Review Studio</h2>
      <p className="cm-body">Every source requires an edition, citation, rights statement and independent review. Exact text matching does not authenticate a hadith or establish its scholarly grading.</p>
      <p className="cm-muted">The public /verify function remains disabled until the reviewed corpus and accuracy release gates pass.</p>
    </div>
    {error?<div role="alert" className="telegram-error-banner">{error}</div>:null}
    {message?<div role="status" className="telegram-compact-card">{message}</div>:null}
    {canEdit?<form className="telegram-compact-card cm-stack" onSubmit={event=>void submit(event)}>
      <h2>Submit source for review</h2>
      <div className="cm-fields">
        <label className="cm-field"><span>Type</span><select className="telegram-select" value={draft.sourceType} onChange={e=>field("sourceType",e.target.value as SourceDraft["sourceType"])}><option value="hadith">Hadith</option><option value="quran">Qur'an</option><option value="scholarship">Scholarly text</option></select></label>
        <label className="cm-field"><span>Source work</span><input className="telegram-text-field" maxLength={180} required value={draft.work} onChange={e=>field("work",e.target.value)}/></label>
        <label className="cm-field"><span>Locator (book, chapter, verse, number)</span><input className="telegram-text-field" maxLength={180} required value={draft.locator} onChange={e=>field("locator",e.target.value)}/></label>
        <label className="cm-field"><span>Edition</span><input className="telegram-text-field" maxLength={180} required value={draft.edition} onChange={e=>field("edition",e.target.value)}/></label>
        <label className="cm-field"><span>Language</span><select className="telegram-select" value={draft.language} onChange={e=>field("language",e.target.value as SourceDraft["language"])}><option value="ar">Arabic</option><option value="en">English</option></select></label>
        <label className="cm-field"><span>Exact source text</span><textarea className="telegram-text-field" rows={4} minLength={10} maxLength={2500} required value={draft.canonicalText} onChange={e=>field("canonicalText",e.target.value)}/></label>
        <label className="cm-field"><span>Source version</span><input className="telegram-text-field" maxLength={180} required value={draft.sourceVersion} onChange={e=>field("sourceVersion",e.target.value)}/></label>
        <label className="cm-field"><span>Source URL (HTTPS, optional)</span><input className="telegram-text-field" type="url" value={draft.sourceUrl} onChange={e=>field("sourceUrl",e.target.value)}/></label>
        <label className="cm-field"><span>Provider / publisher</span><input className="telegram-text-field" maxLength={300} required value={draft.provider} onChange={e=>field("provider",e.target.value)}/></label>
        <label className="cm-field"><span>Bibliographic citation</span><input className="telegram-text-field" maxLength={300} required value={draft.citation} onChange={e=>field("citation",e.target.value)}/></label>
        <label className="cm-field"><span>Rights basis</span><input className="telegram-text-field" maxLength={300} required value={draft.rightsBasis} onChange={e=>field("rightsBasis",e.target.value)}/></label>
        <label className="cm-field"><span>License / permission notice</span><textarea className="telegram-text-field" rows={2} maxLength={600} required value={draft.licenseNotice} onChange={e=>field("licenseNotice",e.target.value)}/></label>
      </div>
      <button className="telegram-primary-button" type="submit" disabled={busy}>{busy?"Submitting…":"Submit for independent review"}</button>
    </form>:null}
    <div className="telegram-compact-card cm-stack">
      <h2>Community source queue</h2>
      {loading?<p className="cm-muted">Loading…</p>:sources.length===0?<p className="cm-muted">No source records submitted.</p>:
      <ul className="cm-list">{sources.map(source=><li className="cm-list-row" key={source.id}>
        <div className="cm-stack min-w-0">
          <strong>{source.work} · {source.locator}</strong>
          <span className="cm-muted">{source.edition} · {source.sourceType} · {source.reviewStatus}</span>
          <p className="cm-body">{source.canonicalText.slice(0,240)}{source.canonicalText.length>240?"…":""}</p>
          <div className="cm-actions">
            {canReview&&source.reviewStatus==="pending"?<button className="telegram-primary-button" type="button" disabled={busy} onClick={()=>void review(source.id,"approve")}>Approve text record</button>:null}
            {canReview&&source.reviewStatus==="approved"?<button className="cm-link-button cm-danger-text" type="button" disabled={busy} onClick={()=>void review(source.id,"revoke")}>Revoke</button>:null}
          </div>
        </div>
      </li>)}</ul>}
    </div>
  </div>;
}
