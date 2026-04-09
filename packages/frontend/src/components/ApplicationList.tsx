"use client";

import { Application } from "@/lib/types";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { contracts } from "@/lib/contracts";

type Props = {
  applications: Application[];
  isSponsor: boolean;
  bountyId: number;
};

export function ApplicationList({ applications, isSponsor, bountyId }: Props) {
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

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

      {isSuccess && (
        <p className="mb-4 text-sm font-medium text-secondary">
          Dev approved! They can now stake their bond.
        </p>
      )}

      <div className="space-y-3">
        {applications.map((app) => (
          <div
            key={app.address}
            className="rounded-lg border border-border-subtle bg-surface-dim p-5 transition-colors hover:border-primary-container"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-on-surface">
                  {app.address}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-on-surface-muted">
                  {app.message}
                </p>
                <p className="mt-2 text-xs text-outline">
                  Applied {app.appliedAt}
                </p>
              </div>
              {isSponsor && (
                <button
                  onClick={() => handleApprove(app.address)}
                  disabled={busy}
                  className="shrink-0 rounded-full bg-secondary-container text-on-secondary-container px-5 py-2 text-xs font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
                >
                  {busy ? "Approving..." : "Approve Dev"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
