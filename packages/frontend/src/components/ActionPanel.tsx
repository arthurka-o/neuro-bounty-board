"use client";

import { useState } from "react";
import { Bounty, formatDeadline } from "@/lib/types";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { contracts } from "@/lib/contracts";
import { erc20Abi, parseUnits } from "viem";

const EURC_ADDRESS = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const;

function useActionTx() {
  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  return { writeContract, isPending, isConfirming, isSuccess, reset };
}

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
    address?.toLowerCase() === bounty.sponsor.toLowerCase();
  const isDev =
    bounty.dev &&
    address?.toLowerCase() === bounty.dev.toLowerCase();

  return (
    <div className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
        Actions
      </h2>

      {bounty.status === "Open" && !isSponsor && (
        <ApplySection bountyId={bounty.id} />
      )}

      {bounty.status === "Open" && isSponsor && (
        <CancelSection bountyId={bounty.id} />
      )}

      {bounty.status === "Applied" && isSponsor && (
        <p className="text-sm text-on-surface-muted">
          A dev has been approved. Waiting for them to stake their bond.
        </p>
      )}

      {bounty.status === "Active" && isDev && (
        <SubmitSection bountyId={bounty.id} />
      )}

      {bounty.status === "Active" && isSponsor && (
        <p className="text-sm text-on-surface-muted">
          Waiting for the dev to submit their deliverable. Deadline:{" "}
          <span className="font-medium text-error">
            {formatDeadline(bounty.deadline)}
          </span>{" "}
          remaining.
        </p>
      )}

      {bounty.status === "Submitted" && isSponsor && (
        <ReviewSection bountyId={bounty.id} />
      )}

      {bounty.status === "Submitted" && isDev && (
        <p className="text-sm text-on-surface-muted">
          Your work has been submitted. Waiting for the sponsor to review.
        </p>
      )}

      {bounty.status === "Disputed" && (
        <VoteSection bountyId={bounty.id} />
      )}

      {(bounty.status === "Approved" || bounty.status === "Resolved") && (
        <p className="text-sm text-on-surface-muted">
          This bounty has been{" "}
          {bounty.status === "Approved" ? "completed" : "resolved"}.
        </p>
      )}

      {bounty.status === "Expired" && isSponsor && (
        <ClaimExpiredSection bountyId={bounty.id} />
      )}
    </div>
  );
}

// ─── Apply (off-chain) ──────────────────────────────────────────────

function ApplySection({ bountyId }: { bountyId: number }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { address } = useAccount();

  async function handleApply() {
    if (!message.trim() || !address) return;
    setSubmitting(true);
    try {
      await fetch(`/api/bounties/${bountyId}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message }),
      });
      setMessage("");
    } catch {}
    setSubmitting(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-muted">
        Interested in working on this bounty? Submit an application.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Describe your experience and how you'd approach this..."
        className="w-full rounded-lg border border-border bg-surface-dim px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:border-secondary/50 focus:outline-none focus:ring-2 focus:ring-secondary/10 transition-all"
        rows={3}
      />
      <button
        onClick={handleApply}
        disabled={submitting || !message.trim()}
        className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
      >
        {submitting ? "Applying..." : "Apply to Bounty"}
      </button>
    </div>
  );
}

// ─── Cancel ─────────────────────────────────────────────────────────

function CancelSection({ bountyId }: { bountyId: number }) {
  const { writeContract, isPending, isConfirming, isSuccess } = useActionTx();

  function handleCancel() {
    writeContract({
      ...contracts.bountyEscrow,
      functionName: "cancelBounty",
      args: [BigInt(bountyId)],
    });
  }

  if (isSuccess) return <p className="text-sm text-secondary font-medium">Bounty cancelled.</p>;

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleCancel}
        disabled={isPending || isConfirming}
        className="rounded-full border border-error/30 bg-error/5 px-6 py-3 text-sm font-bold text-error font-headline hover:bg-error/10 transition-all disabled:opacity-50"
      >
        {isPending || isConfirming ? "Cancelling..." : "Cancel Bounty"}
      </button>
      <span className="text-sm text-on-surface-muted">
        You can cancel before a dev is approved.
      </span>
    </div>
  );
}

// ─── Submit deliverable ─────────────────────────────────────────────

function SubmitSection({ bountyId }: { bountyId: number }) {
  const [proofURI, setProofURI] = useState("");
  const { writeContract, isPending, isConfirming, isSuccess } = useActionTx();

  function handleSubmit() {
    if (!proofURI.trim()) return;
    writeContract({
      ...contracts.bountyEscrow,
      functionName: "submitDeliverable",
      args: [BigInt(bountyId), proofURI],
    });
  }

  if (isSuccess) return <p className="text-sm text-secondary font-medium">Deliverable submitted!</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-muted">
        Ready to submit your work? Provide a link to your deliverable.
      </p>
      <input
        type="text"
        value={proofURI}
        onChange={(e) => setProofURI(e.target.value)}
        placeholder="https://github.com/..."
        className="w-full rounded-lg border border-border bg-surface-dim px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:border-secondary/50 focus:outline-none focus:ring-2 focus:ring-secondary/10 transition-all"
      />
      <button
        onClick={handleSubmit}
        disabled={isPending || isConfirming || !proofURI.trim()}
        className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
      >
        {isPending || isConfirming ? "Submitting..." : "Submit Deliverable"}
      </button>
    </div>
  );
}

// ─── Review (approve / reject) ──────────────────────────────────────

function ReviewSection({ bountyId }: { bountyId: number }) {
  const approve = useActionTx();
  const reject = useActionTx();

  function handleApprove() {
    approve.writeContract({
      ...contracts.bountyEscrow,
      functionName: "approveDeliverable",
      args: [BigInt(bountyId)],
    });
  }

  function handleReject() {
    reject.writeContract({
      ...contracts.bountyEscrow,
      functionName: "rejectDeliverable",
      args: [BigInt(bountyId)],
    });
  }

  if (approve.isSuccess) return <p className="text-sm text-secondary font-medium">Deliverable approved! Funds released.</p>;
  if (reject.isSuccess) return <p className="text-sm text-error font-medium">Deliverable rejected. Dispute opened.</p>;

  const busy = approve.isPending || approve.isConfirming || reject.isPending || reject.isConfirming;

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-muted">
        The dev has submitted their work. Review it and approve or reject.
      </p>
      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={busy}
          className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
        >
          {approve.isPending || approve.isConfirming ? "Approving..." : "Approve & Release Funds"}
        </button>
        <button
          onClick={handleReject}
          disabled={busy}
          className="rounded-full border border-error/30 bg-error/5 px-6 py-3 text-sm font-bold text-error font-headline hover:bg-error/10 transition-all disabled:opacity-50"
        >
          {reject.isPending || reject.isConfirming ? "Rejecting..." : "Reject & Open Dispute"}
        </button>
      </div>
    </div>
  );
}

// ─── Vote (dispute) ─────────────────────────────────────────────────

function VoteSection({ bountyId }: { bountyId: number }) {
  const voteApprove = useActionTx();
  const voteReject = useActionTx();

  // TODO: Semaphore proof generation needed here — for now just the UI skeleton
  // The actual vote requires generating a ZK proof off-chain and passing it to
  // DisputeResolver.vote(bountyId, message, merkleTreeDepth, merkleTreeRoot, nullifier, points)

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-muted">
        This bounty is in dispute. Verified community members can vote.
      </p>
      <div className="flex gap-3">
        <button
          disabled
          className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline opacity-50 cursor-not-allowed"
        >
          Vote: Approve
        </button>
        <button
          disabled
          className="rounded-full border border-error/30 bg-error/5 px-6 py-3 text-sm font-bold text-error font-headline opacity-50 cursor-not-allowed"
        >
          Vote: Reject
        </button>
      </div>
      <p className="text-xs text-outline">
        Voting requires Semaphore proof generation (coming soon). You must be
        a verified subscriber to vote.
      </p>
    </div>
  );
}

// ─── Claim expired bounty ───────────────────────────────────────────

function ClaimExpiredSection({ bountyId }: { bountyId: number }) {
  const { writeContract, isPending, isConfirming, isSuccess } = useActionTx();

  function handleClaim() {
    writeContract({
      ...contracts.bountyEscrow,
      functionName: "claimOnTimeout",
      args: [BigInt(bountyId)],
    });
  }

  if (isSuccess) return <p className="text-sm text-secondary font-medium">Funds reclaimed.</p>;

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleClaim}
        disabled={isPending || isConfirming}
        className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
      >
        {isPending || isConfirming ? "Claiming..." : "Reclaim Funds"}
      </button>
      <span className="text-sm text-on-surface-muted">
        This bounty expired. You can reclaim your funds.
      </span>
    </div>
  );
}
