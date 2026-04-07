import Link from "next/link";
import { Bounty, formatEurc, formatDeadline } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { CategoryBadge } from "./CategoryBadge";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function BountyCard({ bounty }: { bounty: Bounty }) {
  return (
    <Link
      href={`/bounty/${bounty.id}`}
      className="group flex flex-col rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)] border border-transparent hover:border-primary-container/50 hover:shadow-[0_32px_48px_rgba(115,81,102,0.08)] transition-all duration-300"
    >
      <div className="flex items-center gap-2 mb-4">
        <CategoryBadge category={bounty.category} />
        <StatusBadge status={bounty.status} />
      </div>

      <h3 className="text-xl font-bold text-on-surface group-hover:text-primary transition-colors font-headline mb-3">
        {bounty.title}
      </h3>

      <p className="text-sm text-on-surface-muted line-clamp-2 mb-auto">
        {bounty.description}
      </p>

      <div className="mt-8 pt-6 border-t border-border-subtle flex items-end justify-between">
        <div>
          <p className="text-xs text-outline">
            by {truncateAddress(bounty.sponsor)}
          </p>
          <p className="text-xs text-error font-medium mt-1">
            {formatDeadline(bounty.deadline)} left
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-outline">Reward</p>
          <p className="text-3xl font-extrabold text-secondary font-headline">
            &euro;{formatEurc(bounty.reward)}
          </p>
        </div>
      </div>
    </Link>
  );
}
