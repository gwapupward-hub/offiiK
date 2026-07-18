const LINKS = ["Qur'an", "Sunnah", "Companions", "Scholars"];

export default function IsnadChain({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center ${compact ? "gap-2" : "gap-3 sm:gap-5"}`}
      aria-hidden="true"
    >
      {LINKS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center">
            <span
              className={`star-8 bg-[var(--gold)] ${
                compact ? "w-2.5 h-2.5" : "w-3.5 h-3.5 sm:w-4 sm:h-4"
              }`}
            />
            {!compact && (
              <span className="mt-2 text-[10px] sm:text-xs tracking-wide uppercase text-[var(--pine)]/70 font-medium">
                {label}
              </span>
            )}
          </div>
          {i < LINKS.length - 1 && (
            <span
              className={`${
                compact ? "w-4 mx-1" : "w-8 sm:w-12 mx-1 sm:mx-2"
              } h-px bg-[var(--gold)]/50 self-start mt-1.5`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
