"use client";

import { useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { parseUnits, keccak256, toBytes, erc20Abi } from "viem";
import { BOUNTY_CATEGORIES, DEADLINE_OPTIONS, BountyCategory } from "@/lib/types";
import { contracts } from "@/lib/contracts";
import { useEscrowConfig } from "@/lib/hooks";

const EURC_ADDRESS = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const;
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CreateBountyPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { config: escrowConfig } = useEscrowConfig();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<BountyCategory>("Game Integration");
  const [reward, setReward] = useState("");
  const [deadline, setDeadline] = useState(30);
  const [saving, setSaving] = useState(false);

  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: approving,
  } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  const {
    writeContract: writeCreate,
    data: createTxHash,
    isPending: creating,
  } = useWriteContract();
  const { isLoading: createConfirming, isSuccess: createSuccess } =
    useWaitForTransactionReceipt({ hash: createTxHash });

  const bondBps = escrowConfig?.bondPercentageBps ?? 500;
  const rewardNum = parseFloat(reward) || 0;
  const bondAmount = (rewardNum * bondBps) / 10_000;
  const rewardWei = rewardNum > 0 ? parseUnits(reward, 6) : 0n;

  // Check current EURC allowance
  const { data: allowance } = useReadContract({
    address: EURC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address
      ? [address, contracts.bountyEscrow.address]
      : undefined,
    query: { enabled: !!address && rewardWei > 0n },
  });

  const needsApproval = rewardWei > 0n && (allowance ?? 0n) < rewardWei;

  function handleApprove() {
    if (!isConnected || rewardWei === 0n) return;
    writeApprove({
      address: EURC_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [contracts.bountyEscrow.address, rewardWei],
    });
  }

  async function handleCreate() {
    if (!isConnected || !reward || !title || !description) return;

    const deadlineTimestamp = BigInt(
      Math.floor(Date.now() / 1000) + deadline * 86400
    );
    const descHash = keccak256(toBytes(title + description));

    writeCreate(
      {
        ...contracts.bountyEscrow,
        functionName: "createBounty",
        args: [descHash, deadlineTimestamp, rewardWei],
      },
      {
        onSuccess: async () => {
          const nextId = escrowConfig?.nextBountyId ?? 0;
          setSaving(true);
          try {
            await fetch("/api/bounties", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                bountyId: nextId,
                title,
                description,
                category,
              }),
            });
          } catch {
            // Metadata save failed but tx went through — not critical
          }
          setSaving(false);
          router.push(`/bounty/${nextId}`);
        },
      }
    );
  }

  const isSubmitting =
    approving || approveConfirming || creating || createConfirming || saving;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-12">
      {/* Breadcrumb */}
      <nav className="mb-8 animate-fade-up" style={{ animationDelay: "0ms" }}>
        <Link
          href="/"
          className="text-sm text-on-surface-muted hover:text-secondary transition-colors"
        >
          &larr; Back to bounties
        </Link>
      </nav>

      {/* Header */}
      <div
        className="mb-10 animate-fade-up"
        style={{ animationDelay: "50ms" }}
      >
        <h1 className="text-4xl font-extrabold text-on-surface font-headline">
          Post a Bounty
        </h1>
        <p className="mt-3 text-on-surface-muted">
          Describe what you want built, set a reward, and let the community
          deliver.
        </p>
      </div>

      {/* Form */}
      <div
        className="space-y-8 animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        {/* Title */}
        <div className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
          <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline mb-3">
            Bounty Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Minecraft death counter overlay for Neuro-sama"
            className="w-full rounded-xl border border-border bg-surface-dim px-5 py-4 text-on-surface placeholder:text-outline-variant focus:border-secondary/50 focus:outline-none focus:ring-2 focus:ring-secondary/10 transition-all text-lg"
          />
        </div>

        {/* Description */}
        <div className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
          <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline mb-3">
            Description
          </label>
          <p className="text-sm text-on-surface-muted mb-4">
            Be specific about what you want. Include requirements, expected
            behavior, and any technical constraints.
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the deliverable in detail..."
            rows={6}
            className="w-full rounded-xl border border-border bg-surface-dim px-5 py-4 text-on-surface placeholder:text-outline-variant focus:border-secondary/50 focus:outline-none focus:ring-2 focus:ring-secondary/10 transition-all"
          />
        </div>

        {/* Category */}
        <div className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
          <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline mb-4">
            Category
          </label>
          <div className="flex flex-wrap gap-2">
            {BOUNTY_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-5 py-2.5 rounded-full text-sm font-bold font-headline transition-all ${
                  category === cat
                    ? "bg-secondary-container text-on-secondary-container shadow-sm"
                    : "bg-surface-dim text-on-surface-muted hover:text-on-surface border border-border-subtle"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Reward + Deadline row */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Reward */}
          <div className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline mb-3">
              Reward
            </label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-bold text-secondary font-headline">
                &euro;
              </span>
              <input
                type="number"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                placeholder="2,000"
                min="1"
                className="w-full rounded-xl border border-border bg-surface-dim pl-12 pr-5 py-4 text-2xl font-bold text-on-surface font-headline placeholder:text-outline-variant focus:border-secondary/50 focus:outline-none focus:ring-2 focus:ring-secondary/10 transition-all"
              />
            </div>
            <p className="mt-2 text-xs text-outline">
              Paid in EURC. Locked in escrow when posted.
            </p>
          </div>

          {/* Deadline */}
          <div className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline mb-4">
              Implementation Deadline
            </label>
            <div className="flex flex-wrap gap-2">
              {DEADLINE_OPTIONS.map((d) => (
                <button
                  key={d.days}
                  onClick={() => setDeadline(d.days)}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold font-headline transition-all ${
                    deadline === d.days
                      ? "bg-secondary-container text-on-secondary-container shadow-sm"
                      : "bg-surface-dim text-on-surface-muted hover:text-on-surface border border-border-subtle"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-outline">
              Dev must submit within this time after being approved.
            </p>
          </div>
        </div>

        {/* Summary + Submit */}
        <div className="rounded-[2rem] bg-gradient-to-br from-primary-container/40 to-secondary-container/20 p-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-sm text-on-surface-muted mb-1">
                You&apos;re posting a bounty
              </p>
              <p className="text-sm text-on-surface">
                <span className="font-bold">{category}</span> &middot;{" "}
                {deadline} day deadline &middot; {bondBps / 100}% dev bond
                {rewardNum > 0 && (
                  <span className="text-on-surface-muted">
                    {" "}
                    (&euro;{bondAmount.toFixed(2)})
                  </span>
                )}
              </p>
            </div>
            {!isConnected ? (
              <p className="text-sm text-on-surface-muted">
                Connect wallet to post
              </p>
            ) : needsApproval ? (
              <button
                onClick={handleApprove}
                disabled={
                  isSubmitting || !title || !description || rewardNum < 1
                }
                className="bg-secondary-container text-on-secondary-container px-10 py-4 rounded-full font-bold text-base font-headline shadow-lg hover:shadow-xl hover:brightness-95 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                {approving || approveConfirming
                  ? "Approving EURC..."
                  : `Approve €${rewardNum.toLocaleString()}`}
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={
                  isSubmitting || !title || !description || rewardNum < 1
                }
                className="bg-secondary-container text-on-secondary-container px-10 py-4 rounded-full font-bold text-base font-headline shadow-lg hover:shadow-xl hover:brightness-95 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                {creating || createConfirming || saving
                  ? "Posting..."
                  : "Post Bounty"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
