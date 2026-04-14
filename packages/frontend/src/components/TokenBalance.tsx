"use client";

import { useAccount, useReadContract } from "wagmi";
import { TOKEN_ADDRESS, formatTokenAmount } from "@/lib/contracts";
import { erc20Abi } from "viem";

function formatCompact(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toLocaleString();
  return `${whole.toLocaleString()}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

export function TokenBalance() {
  const { address, isConnected } = useAccount();

  const { data: balance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  if (!isConnected || balance === undefined) return null;

  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-surface-dim px-4 py-2 text-sm font-bold font-headline text-secondary border border-border-subtle">
      {formatTokenAmount(formatCompact(balance))}
    </span>
  );
}
