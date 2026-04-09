"use client";

import { useEffect } from "react";
import { Application } from "@/lib/types";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { contracts } from "@/lib/contracts";

type Props = {
  applications: Application[];
  isSponsor: boolean;
  bountyId: number;
  onBountyChanged?: () => void;
};

export function ApplicationList({ applications, isSponsor, bountyId, onBountyChanged }: Props) {
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => { if (isSuccess) onBountyChanged?.(); }, [isSuccess, onBountyChanged]);

  const busy = isPending || isConfirming;

  function handleApprove(devAddress: string) {
    writeContract({
      ...contracts.bountyEscrow,
      functionName: "approveDev",
      args: [BigInt(bountyId), devAddress as `0x${string}`],
    });
  }

  return (
    <div className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
        Applications ({applications.length})
      </h2>

      {isSuccess ? (
        <p className="text-sm font-medium text-secondary">
          Dev approved! Waiting for on-chain update...
        </p>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <div
              key={app.address}
              className="rounded-lg border border-border-subtle bg-surface-dim p-5 transition-colors hover:border-primary-container"
            >
              <p className="text-sm font-semibold text-on-surface break-all">
                {app.address}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-on-surface-muted">
                {app.message}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-outline">
                  Applied {app.appliedAt}
                </p>
                {isSponsor && (
                  <button
                    onClick={() => handleApprove(app.address)}
                    disabled={busy}
                    className="rounded-full bg-secondary-container text-on-secondary-container px-5 py-2 text-xs font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {busy ? "Approving..." : "Approve Dev"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
