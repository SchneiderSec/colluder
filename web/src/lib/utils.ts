import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The four type sizes are theme names (index.css: text-label, text-body, text-title, text-headline).
// tailwind-merge has to know they are font sizes: an unknown text-* name is taken for a colour, and
// merging would drop the real colour (the Plant button's text went cream on cream).
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["label", "body", "title", "headline"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
