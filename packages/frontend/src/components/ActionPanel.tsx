"use client";

import { Bounty } from "@/lib/types";
import { useAccount } from "wagmi";

export function ActionPanel({ bounty }: { bounty: Bounty }) {
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="rounded-[2rem] border border-dashed border-border bg-surface p-8 text-center">
        <p className="text-sm text-on-surface-muted">
          Connect your wallet to interact with this bounty.
        </p>
      </div>
    );
  }

  const isSponsor =
    address?.toLowerCase().startsWith(bounty.sponsor.slice(0, 4).toLowerCase()) ??
    false;
  const isDev =
    bounty.dev &&
    (address
      ?.toLowerCase()
      .startsWith(bounty.dev.slice(0, 4).toLowerCase()) ??
      false);

  return (
    <div className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
        Actions
      </h2>

      {bounty.status === "Open" && !isSponsor && (
        <div className="space-y-4">
          <p className="text-sm text-on-surface-muted">
            Interested in working on this bounty? Submit an application.
          </p>
          <textarea
            placeholder="Describe your experience and how you'd approach this..."
            className="w-full rounded-lg border border-border bg-surface-dim px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:border-secondary/50 focus:outline-none focus:ring-2 focus:ring-secondary/10 transition-all"
            rows={3}
          />
          <button className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95">
            Apply to Bounty
          </button>
        </div>
      )}

      {bounty.status === "Open" && isSponsor && (
        <div className="flex items-center gap-4">
          <button className="rounded-full border border-error/30 bg-error/5 px-6 py-3 text-sm font-bold text-error font-headline hover:bg-error/10 transition-all">
            Cancel Bounty
          </button>
          <span className="text-sm text-on-surface-muted">
            You can cancel before a dev is approved.
          </span>
        </div>
      )}

      {bounty.status === "Active" && isDev && (
        <div className="space-y-4">
          <p className="text-sm text-on-surface-muted">
            Ready to submit your work? Provide a link to your deliverable.
          </p>
          <input
            type="text"
            placeholder="https://github.com/..."
            className="w-full rounded-lg border border-border bg-surface-dim px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:border-secondary/50 focus:outline-none focus:ring-2 focus:ring-secondary/10 transition-all"
          />
          <button className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95">
            Submit Deliverable
          </button>
        </div>
      )}

      {bounty.status === "Active" && isSponsor && (
        <p className="text-sm text-on-surface-muted">
          Waiting for the dev to submit their deliverable. Deadline:{" "}
          <span className="font-medium text-error">{bounty.deadline}</span>{" "}
          remaining.
        </p>
      )}

      {bounty.status === "Submitted" && isSponsor && (
        <div className="space-y-4">
          <p className="text-sm text-on-surface-muted">
            The dev has submitted their work. Review it and approve or reject.
          </p>
          <div className="flex gap-3">
            <button className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95">
              Approve &amp; Release Funds
            </button>
            <button className="rounded-full border border-error/30 bg-error/5 px-6 py-3 text-sm font-bold text-error font-headline hover:bg-error/10 transition-all">
              Reject &amp; Open Dispute
            </button>
          </div>
          {bounty.reviewDeadline && (
            <p className="text-xs text-outline">
              If you don&apos;t respond within {bounty.reviewDeadline}, the dev
              can redeem funds directly.
            </p>
          )}
        </div>
      )}

      {bounty.status === "Submitted" && isDev && (
        <p className="text-sm text-on-surface-muted">
          Your work has been submitted. Waiting for the sponsor to review.
          {bounty.reviewDeadline &&
            ` If they don't respond within ${bounty.reviewDeadline}, you can claim the funds.`}
        </p>
      )}

      {bounty.status === "Disputed" && (
        <div className="space-y-4">
          <p className="text-sm text-on-surface-muted">
            This bounty is in dispute. Verified community members can vote.
          </p>
          <div className="flex gap-3">
            <button className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95">
              Vote: Approve
            </button>
            <button className="rounded-full border border-error/30 bg-error/5 px-6 py-3 text-sm font-bold text-error font-headline hover:bg-error/10 transition-all">
              Vote: Reject
            </button>
          </div>
          <p className="text-xs text-outline">
            Your vote is anonymous via Semaphore. You must be a verified
            subscriber to vote.
          </p>
        </div>
      )}

      {(bounty.status === "Approved" || bounty.status === "Resolved") && (
        <p className="text-sm text-on-surface-muted">
          This bounty has been{" "}
          {bounty.status === "Approved" ? "completed" : "resolved"}.
        </p>
      )}
    </div>
  );
}
