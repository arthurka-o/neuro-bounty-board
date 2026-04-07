"use client";

import { BOUNTY_CATEGORIES, BountyCategory } from "@/lib/types";

type Props = {
  selected: BountyCategory | null;
  onSelect: (cat: BountyCategory | null) => void;
};

export function CategoryFilter({ selected, onSelect }: Props) {
  return (
    <div className="flex items-center gap-1.5 bg-surface-dim p-1.5 rounded-full border border-outline-variant/10">
      <button
        onClick={() => onSelect(null)}
        className={`px-5 py-2 rounded-full text-sm font-bold font-headline transition-all ${
          selected === null
            ? "bg-surface text-on-surface shadow-sm"
            : "text-on-surface-muted hover:text-on-surface"
        }`}
      >
        All Bounties
      </button>
      {BOUNTY_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-5 py-2 rounded-full text-sm font-bold font-headline transition-all ${
            selected === cat
              ? "bg-surface text-on-surface shadow-sm"
              : "text-on-surface-muted hover:text-on-surface"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
