"use client";

import { useEffect, useState } from "react";

/**
 * Loading indicator for a non-streaming request.
 *
 * Deliberately ambient rather than stepped: the API returns one response at the
 * end, so we have no real progress to report. Showing "Checked Qur'an ✓ →
 * Checked Sunnah ✓" would invent progress we can't observe — on an app whose
 * entire premise is verifiable sourcing, that's the wrong lie to tell. Instead
 * the isnād chain itself pulses along its four links, and after a long wait we
 * say the only honest thing we know: it's taking a while.
 */
export default function ChainLoader() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-2 px-1 py-1" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="star-8 chain-pulse h-2.5 w-2.5 bg-[var(--gold)]"
              style={{ animationDelay: `${i * 0.35}s` }}
            />
          ))}
        </span>
        <span className="text-sm text-[var(--pine)]/60">Tracing the chain&hellip;</span>
      </div>
      {slow && (
        <p className="pl-[3.1rem] text-xs text-[var(--pine)]/45">
          Still working — detailed questions take a little longer.
        </p>
      )}
    </div>
  );
}
