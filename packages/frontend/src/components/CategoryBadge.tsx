import { BountyCategory } from "@/lib/types";

const STYLES: Record<BountyCategory, string> = {
  "Game Integration": "bg-secondary-container/30 text-secondary",
  Art: "bg-primary-container text-primary",
  Tool: "bg-tertiary-container/20 text-tertiary",
  Other: "bg-surface-container text-on-surface-muted",
};

export function CategoryBadge({ category }: { category: BountyCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider font-headline ${STYLES[category]}`}
    >
      {category}
    </span>
  );
}
