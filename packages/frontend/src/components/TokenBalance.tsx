"use client";

import { useAccount, useReadContract } from "wagmi";
import { TOKEN_ADDRESS, CHAIN_ID, formatTokenAmount } from "@/lib/contracts";
import { erc20Abi } from "viem";
import Link from "next/link";

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === "sepolia";

function formatCompact(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toLocaleString();
  return `${whole.toLocaleString()}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

export function TokenBalance() {
  const { address, status } = useAccount();

  const { data: balance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: {
      enabled: status === "connected" && !!address,
      refetchInterval: 5_000,
    },
  });

  if (status !== "connected" || !address || balance === undefined) return null;

  const display = formatTokenAmount(formatCompact(balance));

  if (isTestnet && balance === 0n) {
    return (
      <Link
        href="/faucet"
        className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-surface-dim px-4 py-2 text-sm font-bold font-headline text-on-surface-muted border border-border-subtle hover:border-secondary/30 hover:text-secondary transition-all"
      >
        {display}
      </Link>
    );
  }

  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-surface-dim px-4 py-2 text-sm font-bold font-headline text-secondary border border-border-subtle">
      {display}
    </span>
  );
}
