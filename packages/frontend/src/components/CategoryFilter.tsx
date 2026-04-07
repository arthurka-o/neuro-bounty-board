"use client";

import { useState } from "react";
import { BOUNTY_CATEGORIES, BountyCategory } from "@/lib/types";

export function CategoryFilter() {
  const [active, setActive] = useState<BountyCategory | "All">("All");

  return (
    <div className="flex items-center gap-1.5 bg-surface-dim p-1.5 rounded-full border border-outline-variant/10">
      <button
        onClick={() => setActive("All")}
        className={`px-5 py-2 rounded-full text-sm font-bold font-headline transition-all ${
          active === "All"
            ? "bg-surface text-on-surface shadow-sm"
            : "text-on-surface-muted hover:text-on-surface"
        }`}
      >
        All Bounties
      </button>
      {BOUNTY_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => setActive(cat)}
          className={`px-5 py-2 rounded-full text-sm font-bold font-headline transition-all ${
            active === cat
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
