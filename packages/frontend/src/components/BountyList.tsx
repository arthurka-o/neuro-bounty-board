import { MOCK_BOUNTIES } from "@/lib/mock-data";
import { BountyCard } from "./BountyCard";
import { ReactNode } from "react";

export function BountyList({ ctaCard }: { ctaCard?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {MOCK_BOUNTIES.map((bounty) => (
        <BountyCard key={bounty.id} bounty={bounty} />
      ))}
      {ctaCard}
    </div>
  );
}
