import { Bounty } from "@/lib/types";

export function InfoRow({ bounty }: { bounty: Bounty }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-on-surface-muted">
      <span>
        Sponsor{" "}
        <span className="font-medium text-on-surface">{bounty.sponsor}</span>
      </span>
      {bounty.dev && (
        <span>
          Dev{" "}
          <span className="font-medium text-on-surface">{bounty.dev}</span>
        </span>
      )}
      <span>Posted {bounty.createdAt}</span>
      <span className="font-medium text-error">{bounty.deadline} left</span>
    </div>
  );
}
