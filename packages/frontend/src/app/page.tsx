"use client";

import { BountyList } from "@/components/BountyList";
import { CategoryFilter } from "@/components/CategoryFilter";
import { useEscrowConfig } from "@/lib/hooks";
import { formatEurc } from "@/lib/types";
import type { BountyCategory } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [category, setCategory] = useState<BountyCategory | null>(null);
  const { config } = useEscrowConfig();

  return (
    <div className="mx-auto max-w-[1920px] px-6 sm:px-12">
      {/* Hero */}
      <header
        className="pt-16 pb-12 animate-fade-up"
        style={{ animationDelay: "0ms" }}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-primary-container/40 to-secondary-container/20 rounded-3xl p-12">
          <div className="relative z-10 max-w-2xl">
            <h1 className="text-5xl font-extrabold text-on-surface font-headline leading-tight sm:text-6xl">
              Open Bounties
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-on-surface-muted">
              Fund game integrations, tools, and art for the Neuro-sama
              community. Complete bounties, earn rewards.
            </p>
          </div>
        </div>
      </header>

      {/* Filters & Stats */}
      <section
        className="mb-10 flex flex-wrap items-center gap-6 animate-fade-up"
        style={{ animationDelay: "50ms" }}
      >
        <CategoryFilter selected={category} onSelect={setCategory} />
        {config && (
          <div className="ml-auto flex items-center gap-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-secondary font-headline">
                {config.nextBountyId}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-outline">
                Total Bounties
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Bounties */}
      <section
        className="pb-24 animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        <BountyList
          category={category}
          ctaCard={
            <Link
              href="/create"
              className="flex flex-col rounded-3xl bg-primary text-on-primary p-10 relative overflow-hidden justify-center items-center text-center transition-all hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(253,208,234,0.3),transparent)]" />
              <span className="text-5xl mb-4 relative z-10">🚀</span>
              <h3 className="text-2xl font-bold mb-3 relative z-10 font-headline">
                Have a Great Idea?
              </h3>
              <p className="text-on-primary/80 text-sm mb-6 relative z-10 max-w-[240px]">
                Post your own bounty and let the community bring your vision to
                life.
              </p>
              <span className="px-8 py-3 bg-secondary-container text-on-secondary-container rounded-full font-bold text-sm font-headline shadow-lg relative z-10">
                Post Bounty Now
              </span>
            </Link>
          }
        />
      </section>
    </div>
  );
}
