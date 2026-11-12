import { ultraParts } from "@/lib/ultrathink";

// Text with every "ultrathink" in it drawn as a flowing rainbow (lib/ultrathink.ts). Each letter
// starts on the next of seven colours (red to violet, left to right) and the colours flow rightward
// through the word; reduced motion keeps the still rainbow. Plain inline spans, so truncation, copy
// and reading the word aloud are unchanged.
const STEP = 0.3; // seconds between neighbouring letters; the cycle is seven steps
export function Ultra({ text }: { text: string }) {
  const parts = ultraParts(text);
  if (!parts.some((p) => p.ultra)) return <>{text}</>;
  // one span, so a flex parent (the probe header) doesn't space the pieces apart
  return (
    <span>
      {parts.map((p, n) => !p.ultra ? p.s : (
        <span key={n} className="ultra">
          {[...p.s].map((ch, i) => (
            <span key={i} className="ultra-l" style={{ color: `var(--rb-${(i % 7) + 1})`, animationDelay: `${((i - 14) * STEP).toFixed(1)}s` }}>{ch}</span>
          ))}
        </span>
      ))}
    </span>
  );
}
