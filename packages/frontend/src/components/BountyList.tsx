"use client";

import { useEffect, useState } from "react";
import { fetchBounties, type SubgraphBounty } from "@/lib/subgraph";
import type { BountyMetadata } from "@/lib/db";
import { type Bounty, type BountyCategory } from "@/lib/types";
import { BountyCard } from "./BountyCard";
import { ReactNode } from "react";

export function BountyList({
  ctaCard,
  category,
}: {
  ctaCard?: ReactNode;
  category?: BountyCategory | null;
}) {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch on-chain data from subgraph + off-chain metadata from SQLite
        const [onChain, metaRes] = await Promise.all([
          fetchBounties(),
          fetch("/api/bounties").then((r) => r.json() as Promise<BountyMetadata[]>),
        ]);

        // Index metadata by bounty_id for fast lookup
        const metaMap = new Map<number, BountyMetadata>();
        for (const m of metaRes) {
          metaMap.set(m.bounty_id, m);
        }

        // Merge subgraph + SQLite data
        const merged: Bounty[] = onChain.map((b: SubgraphBounty) => {
          const id = Number(b.id);
          const meta = metaMap.get(id);
          return {
            id,
            title: meta?.title ?? `Bounty #${id}`,
            description: meta?.description ?? "",
            category: (meta?.category ?? "Other") as BountyCategory,
            sponsor: b.sponsor,
            dev: b.dev,
            reward: BigInt(b.reward),
            bond: BigInt(b.bond ?? "0"),
            deadline: Number(b.deadline),
            bondStakeDeadline: Number(b.bondStakeDeadline ?? "0"),
            submissionTime: Number(b.submissionTime ?? "0"),
            descriptionHash: "",
            proofURIHash: "",
            status: b.status as Bounty["status"],
            createdAt: meta?.created_at ?? new Date(Number(b.createdAt) * 1000).toISOString(),
          };
        });

        setBounties(merged);
      } catch {
        // Subgraph may not be deployed yet — fail silently
      }
      setIsLoading(false);
    }
    load();
  }, []);

  // Filter by category
  const filtered = category
    ? bounties.filter((b) => b.category === category)
    : bounties;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[2rem] bg-surface p-8 animate-pulse h-64"
          />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="text-7xl mb-6">
          {category ? "🔍" : "🦗"}
        </span>
        <h3 className="text-2xl font-bold text-on-surface font-headline mb-2">
          {category
            ? `No ${category} bounties yet`
            : "No bounties yet... crickets"}
        </h3>
        <p className="text-on-surface-muted max-w-md">
          {category
            ? "Try a different category or be the first to post one!"
            : "Be the first to post a bounty and get the board going. Neuro would be proud."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {filtered.map((bounty) => (
        <BountyCard key={bounty.id} bounty={bounty} />
      ))}
      {ctaCard}
    </div>
  );
}
