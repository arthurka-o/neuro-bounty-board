"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { TOKEN_ADDRESS, CHAIN_ID } from "@/lib/contracts";
import Link from "next/link";

const neurTokenAbi = [
  {
    type: "function",
    name: "faucet",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lastFaucetDrip",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "FAUCET_AMOUNT",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "FAUCET_COOLDOWN",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

function formatBalance(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toLocaleString();
  return `${whole.toLocaleString()}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

export default function FaucetPage() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && walletChainId !== CHAIN_ID;

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: neurTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: lastDrip } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: neurTokenAbi,
    functionName: "lastFaucetDrip",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash, query: { enabled: !!txHash } });

  const claimed = !!txHash && isConfirmed;

  useEffect(() => {
    if (claimed) refetchBalance();
  }, [claimed, refetchBalance]);

  // Cooldown timer
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(interval);
  }, []);

  const cooldownEnd = lastDrip ? Number(lastDrip) + 86400 : 0;
  const onCooldown = now < cooldownEnd;
  const cooldownRemaining = cooldownEnd - now;
  const hours = Math.floor(cooldownRemaining / 3600);
  const minutes = Math.floor((cooldownRemaining % 3600) / 60);

  function handleFaucet() {
    if (wrongChain) {
      switchChain({ chainId: CHAIN_ID });
      return;
    }
    writeContract({
      address: TOKEN_ADDRESS,
      abi: neurTokenAbi,
      functionName: "faucet",
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-12">
      <nav className="mb-8 animate-fade-up" style={{ animationDelay: "0ms" }}>
        <Link
          href="/"
          className="text-sm text-on-surface-muted hover:text-secondary transition-colors"
        >
          &larr; Back to bounties
        </Link>
      </nav>

      {/* Hero */}
      <div className="mb-10 animate-fade-up" style={{ animationDelay: "50ms" }}>
        <h1 className="text-4xl font-extrabold text-on-surface font-headline">
          Get Test Tokens
        </h1>
        <p className="mt-3 text-on-surface-muted">
          Grab some free nEUR to try out the bounty board.
        </p>
      </div>

      {/* What is this */}
      <div
        className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)] mb-6 animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline mb-4">
          What is this?
        </h2>
        <div className="space-y-3 text-sm text-on-surface-muted leading-relaxed">
          <p>
            This is a <span className="font-medium text-on-surface">demo version</span> of the
            Neuro Bounty Board running on a test network. Everything works
            exactly like the real thing, but with play money instead of real
            euros.
          </p>
          <p>
            <span className="font-bold text-secondary">nEUR</span> is our test
            token &mdash; it stands in for real currency so you can try posting
            bounties, applying to work on them, staking bonds, and voting on
            disputes without spending a cent.
          </p>
          <p>
            You can claim <span className="font-medium text-on-surface">500 nEUR</span> every 24
            hours from the faucet below. That&rsquo;s enough to post a few bounties
            or stake bonds.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div
        className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)] mb-6 animate-fade-up"
        style={{ animationDelay: "150ms" }}
      >
        <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline mb-4">
          How the bounty board works
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Step number={1} title="Post a bounty">
            Describe what you want built and set a reward. The money is locked
            in escrow &mdash; nobody can touch it until the work is done.
          </Step>
          <Step number={2} title="Apply as a developer">
            See a bounty you can tackle? Apply with a short message. If the
            poster picks you, you stake a small bond to show you&rsquo;re serious.
          </Step>
          <Step number={3} title="Submit your work">
            Once you&rsquo;re done, submit a link to your deliverable. The poster
            reviews it and either approves (you get paid) or rejects it.
          </Step>
          <Step number={4} title="Community disputes">
            If a rejection seems unfair, the community votes anonymously to
            decide the outcome. Verified Twitch subscribers can participate.
          </Step>
        </div>
      </div>

      {/* Faucet */}
      <div
        className="rounded-[2rem] bg-gradient-to-br from-primary-container/40 to-secondary-container/20 p-8 animate-fade-up"
        style={{ animationDelay: "200ms" }}
      >
        <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline mb-4">
          Faucet
        </h2>

        {!isConnected ? (
          <p className="text-sm text-on-surface-muted">
            Connect your wallet to claim test tokens.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Balance */}
            <div className="flex items-baseline gap-3">
              <span className="text-sm text-on-surface-muted">Your balance:</span>
              <span className="text-3xl font-extrabold text-secondary font-headline">
                {balance !== undefined ? formatBalance(balance) : "..."}
              </span>
              <span className="text-sm font-bold text-secondary">nEUR</span>
            </div>

            {/* Button */}
            {claimed ? (
              <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
                <p className="text-sm font-medium text-secondary">
                  500 nEUR claimed! Go post a bounty or apply to one.
                </p>
              </div>
            ) : onCooldown && !isPending ? (
              <div className="space-y-2">
                <button
                  disabled
                  className="rounded-full bg-secondary-container text-on-secondary-container px-8 py-4 text-base font-bold font-headline opacity-50 cursor-not-allowed"
                >
                  Claim 500 nEUR
                </button>
                <p className="text-xs text-on-surface-muted">
                  You can claim again in{" "}
                  <span className="font-medium text-on-surface">
                    {hours}h {minutes}m
                  </span>
                </p>
              </div>
            ) : (
              <button
                onClick={handleFaucet}
                disabled={isPending || isConfirming}
                className="rounded-full bg-secondary-container text-on-secondary-container px-8 py-4 text-base font-bold font-headline shadow-lg hover:shadow-xl hover:brightness-95 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {(isPending || isConfirming) && <Spinner />}
                {wrongChain
                  ? "Switch to Base Sepolia"
                  : isPending
                    ? "Waiting for wallet..."
                    : isConfirming
                      ? "Confirming..."
                      : "Claim 500 nEUR"}
              </button>
            )}

            {writeError && (
              <div className="text-xs text-error space-y-1">
                <p>
                  {writeError.message.includes("cooldown")
                    ? "You can only claim once every 24 hours."
                    : "Something went wrong. Try again."}
                </p>
                <details className="text-outline">
                  <summary className="cursor-pointer">Details</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-all text-[10px]">
                    {writeError.message}
                  </pre>
                </details>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold font-headline">
        {number}
      </span>
      <div>
        <p className="text-sm font-bold text-on-surface">{title}</p>
        <p className="text-sm text-on-surface-muted mt-1 leading-relaxed">
          {children}
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
