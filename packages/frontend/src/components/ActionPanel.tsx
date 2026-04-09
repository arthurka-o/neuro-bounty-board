"use client";

import { useState, useCallback, useEffect } from "react";
import { Bounty, Application, formatDeadline } from "@/lib/types";
import type { SubgraphBounty } from "@/lib/subgraph";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useSignMessage,
  usePublicClient,
} from "wagmi";
import { contracts } from "@/lib/contracts";
import { fetchDisputeVoters } from "@/lib/subgraph";
import { erc20Abi, parseUnits, toHex, keccak256, encodePacked, type Hex } from "viem";
// Semaphore imports are dynamic to avoid SSR/Turbopack issues with WASM
const getSemaphore = () => import("@/lib/semaphore");

const MAX_VOTE_RETRIES = 3;

const EURC_ADDRESS = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const;

function useActionTx() {
  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  return { writeContract, isPending, isConfirming, isSuccess, reset };
}

export function ActionPanel({ bounty, applications, onApplicationSubmitted, onBountyChanged }: { bounty: Bounty; applications?: Application[]; onApplicationSubmitted?: () => void; onBountyChanged?: (patch: Partial<SubgraphBounty>) => void }) {
  const { address, isConnected } = useAccount();

  const isSponsor =
    isConnected && address?.toLowerCase() === bounty.sponsor.toLowerCase();
  const isDev =
    isConnected && bounty.dev &&
    address?.toLowerCase() === bounty.dev.toLowerCase();

  return (
    <div className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
        {bounty.status === "Approved" || bounty.status === "Resolved" || bounty.status === "Cancelled" ? "Status" : "Actions"}
      </h2>

      {/* Read-only statuses — visible to everyone */}

      {bounty.status === "Approved" && (
        <p className="text-sm text-on-surface-muted">
          This bounty has been completed. Funds released to the dev.
        </p>
      )}

      {bounty.status === "Resolved" && bounty.dispute && (
        <ResolvedDisputeSection dispute={bounty.dispute} />
      )}

      {bounty.status === "Resolved" && !bounty.dispute && (
        <p className="text-sm text-on-surface-muted">
          This bounty has been resolved.
        </p>
      )}

      {bounty.status === "Cancelled" && (
        <p className="text-sm text-on-surface-muted">
          This bounty has been cancelled.
        </p>
      )}

      {bounty.status === "Disputed" && (
        <VoteSection bountyId={bounty.id} dispute={bounty.dispute} onSuccess={() => onBountyChanged?.({ status: "Disputed" })} />
      )}

      {/* Interactive actions — require wallet */}

      {bounty.status === "Applied" && (
        !isConnected ? (
          <p className="text-sm text-on-surface-muted">A dev has been approved. Waiting for them to stake their bond.</p>
        ) : isSponsor ? (
          <p className="text-sm text-on-surface-muted">A dev has been approved. Waiting for them to stake their bond.</p>
        ) : isDev ? (
          <StakeBondSection bountyId={bounty.id} reward={bounty.reward} onSuccess={() => onBountyChanged?.({ status: "Active" })} />
        ) : (
          <p className="text-sm text-on-surface-muted">A dev has been approved. Waiting for them to stake their bond.</p>
        )
      )}

      {bounty.status === "Open" && (
        !isConnected ? (
          <p className="text-sm text-on-surface-muted">Connect your wallet to apply or interact with this bounty.</p>
        ) : isSponsor ? (
          <CancelSection bountyId={bounty.id} onSuccess={() => onBountyChanged?.({ status: "Cancelled" })} />
        ) : (
          <ApplySection bountyId={bounty.id} applications={applications} onSuccess={onApplicationSubmitted} />
        )
      )}

      {bounty.status === "Active" && (
        !isConnected ? (
          <p className="text-sm text-on-surface-muted">Dev is working on this bounty.</p>
        ) : isDev ? (
          <SubmitSection bountyId={bounty.id} onSuccess={() => onBountyChanged?.({ status: "Submitted", submissionTime: String(Math.floor(Date.now() / 1000)) })} />
        ) : isSponsor ? (
          <p className="text-sm text-on-surface-muted">
            Waiting for the dev to submit their deliverable. Deadline:{" "}
            <span className="font-medium text-error">{formatDeadline(bounty.deadline)}</span> remaining.
          </p>
        ) : (
          <p className="text-sm text-on-surface-muted">Dev is working on this bounty.</p>
        )
      )}

      {bounty.status === "Submitted" && (
        !isConnected ? (
          <p className="text-sm text-on-surface-muted">Deliverable submitted. Waiting for sponsor review.</p>
        ) : isSponsor ? (
          <ReviewSection bountyId={bounty.id} onBountyChanged={onBountyChanged} />
        ) : (
          <p className="text-sm text-on-surface-muted">Deliverable submitted. Waiting for sponsor review.</p>
        )
      )}

      {bounty.status === "Expired" && isSponsor && (
        <ClaimExpiredSection bountyId={bounty.id} onSuccess={() => onBountyChanged?.({ status: "Expired" })} />
      )}
    </div>
  );
}

// ─── Apply (off-chain) ──────────────────────────────────────────────

function ApplySection({ bountyId, applications, onSuccess }: { bountyId: number; applications?: Application[]; onSuccess?: () => void }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState(false);
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const alreadyApplied = address && applications?.some(
    (a) => a.address.toLowerCase() === address.toLowerCase()
  );

  async function handleApply() {
    if (!message.trim() || !address) return;
    setSubmitting(true);
    try {
      const signature = await signMessageAsync({
        message: `Apply to bounty #${bountyId}\n\n${message}`,
      });
      const res = await fetch(`/api/bounties/${bountyId}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message, signature }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      setMessage("");
      setApplied(true);
      onSuccess?.();
    } catch {}
    setSubmitting(false);
  }

  if (applied || alreadyApplied) {
    return <p className="text-sm text-secondary font-medium">Application submitted!</p>;
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

function CancelSection({ bountyId, onSuccess }: { bountyId: number; onSuccess?: () => void }) {
  const { writeContract, isPending, isConfirming, isSuccess } = useActionTx();

  useEffect(() => { if (isSuccess) onSuccess?.(); }, [isSuccess, onSuccess]);

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

function SubmitSection({ bountyId, onSuccess }: { bountyId: number; onSuccess?: () => void }) {
  const [proofURI, setProofURI] = useState("");
  const { writeContract, isPending, isConfirming, isSuccess } = useActionTx();

  useEffect(() => { if (isSuccess) onSuccess?.(); }, [isSuccess, onSuccess]);

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
        maxLength={2048}
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

function ReviewSection({ bountyId, onBountyChanged }: { bountyId: number; onBountyChanged?: (patch: Partial<SubgraphBounty>) => void }) {
  const approve = useActionTx();
  const reject = useActionTx();

  useEffect(() => { if (approve.isSuccess) onBountyChanged?.({ status: "Approved" }); }, [approve.isSuccess, onBountyChanged]);
  useEffect(() => { if (reject.isSuccess) onBountyChanged?.({ status: "Disputed" }); }, [reject.isSuccess, onBountyChanged]);

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

// ─── Stake Bond ─────────────────────────────────────────────────────

function StakeBondSection({ bountyId, reward, onSuccess }: { bountyId: number; reward: bigint; onSuccess?: () => void }) {
  const { address } = useAccount();
  const approveTx = useActionTx();
  const stakeTx = useActionTx();

  useEffect(() => { if (stakeTx.isSuccess) onSuccess?.(); }, [stakeTx.isSuccess, onSuccess]);

  const { data: bondBps } = useReadContract({
    ...contracts.bountyEscrow,
    functionName: "bondPercentageBps",
  });

  const bond = bondBps ? (reward * BigInt(bondBps)) / 10000n : 0n;

  const { data: allowance } = useReadContract({
    address: EURC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, contracts.bountyEscrow.address] : undefined,
  });

  const needsApproval = allowance !== undefined && allowance < bond;
  const bondFormatted = (Number(bond) / 1e6).toFixed(2);

  function handleApprove() {
    approveTx.writeContract({
      address: EURC_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [contracts.bountyEscrow.address, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
    });
  }

  function handleStake() {
    stakeTx.writeContract({
      ...contracts.bountyEscrow,
      functionName: "stakeBond",
      args: [BigInt(bountyId)],
    });
  }

  if (stakeTx.isSuccess) {
    return <p className="text-sm text-secondary font-medium">Bond staked! Bounty is now active.</p>;
  }

  const busy = approveTx.isPending || approveTx.isConfirming || stakeTx.isPending || stakeTx.isConfirming;

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-muted">
        You&apos;ve been approved for this bounty. Stake your bond of{" "}
        <span className="font-bold text-on-surface">&euro;{bondFormatted}</span>{" "}
        to start working.
      </p>
      {needsApproval && !approveTx.isSuccess ? (
        <button
          onClick={handleApprove}
          disabled={busy}
          className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
        >
          {approveTx.isPending || approveTx.isConfirming ? "Approving EURC..." : `Approve EURC`}
        </button>
      ) : (
        <button
          onClick={handleStake}
          disabled={busy}
          className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
        >
          {stakeTx.isPending || stakeTx.isConfirming ? "Staking bond..." : `Stake Bond (€${bondFormatted})`}
        </button>
      )}
    </div>
  );
}

// ─── Vote (dispute) ─────────────────────────────────────────────────

interface TLSNAttestation {
  signature: Hex;
  attestationHash: Hex;
  serverDomain: string;
  timestamp: number;
  commitments: Hex[];
  salts: Hex[];
  chunkIndices: number[];
}

interface TLSNResult {
  type: string;
  part: string;
  value: string;
}

interface TLSNProof {
  results: TLSNResult[];
  attestation?: TLSNAttestation;
}

const VERIFIER_URL = "https://notary.reyvon.gay";

async function pollForAttestation(correlationId: string): Promise<TLSNAttestation> {
  const maxAttempts = 30;
  const intervalMs = 2000;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${VERIFIER_URL}/attestation/${encodeURIComponent(correlationId)}`);
    if (!res.ok) throw new Error(`Attestation poll failed: ${res.status}`);
    const data = await res.json();
    if (data.status === "complete" && data.attestation) {
      return data.attestation as TLSNAttestation;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Attestation timed out — verifier may not have signing key configured");
}

type VoteStatus = "idle" | "proving" | "joining" | "voting" | "done";

function VoteSection({ bountyId, dispute, onSuccess }: { bountyId: number; dispute?: Bounty["dispute"]; onSuccess?: () => void }) {
  const [status, setStatus] = useState<VoteStatus>("idle");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { address } = useAccount();
  const voteKey = `voted:${bountyId}`;
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();

  // Check localStorage on mount
  useEffect(() => {
    if (localStorage.getItem(voteKey) !== null) setStatus("done");
  }, [voteKey]);

  const handleVote = useCallback(async (vote: 0 | 1) => {
    setError(null);

    try {
      const { getOrCreateIdentity, generateVoteProof } = await getSemaphore();

      // Step 1: Get or create Semaphore identity
      setStatus("joining");
      setStatusText("Creating voting identity...");
      const identity = await getOrCreateIdentity(signMessageAsync, address);

      // Step 2: Check if already in the dispute group
      const existingMembers = await fetchDisputeVoters(bountyId);
      const alreadyJoined = existingMembers.includes(identity.commitment);

      if (!alreadyJoined) {
        // Need TLSNotary proof to join
        setStatus("proving");
        setStatusText("Generating subscription proof...");

        if (!window.tlsn) throw new Error("TLSNotary extension not found. Install it to vote.");

        const correlationId = `vote_${bountyId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const pluginCode = await fetch("/plugins/twitch_sub.js").then((r) => r.text());
        const result = await window.tlsn.execCode(pluginCode, {
          requestId: correlationId,
          sessionData: { correlationId },
        });
        const proofData: TLSNProof = JSON.parse(result);

        setStatusText("Waiting for notary attestation...");
        const attestation = await pollForAttestation(correlationId);

        // Check if this Twitch account already joined
        const idMatch = proofData.results
          .map((r) => r.value)
          .join("")
          .match(/"id":"(\d+)"/);
        if (idMatch) {
          const twitchIdHash = keccak256(encodePacked(["string"], [idMatch[1]]));
          const alreadyUsed = await publicClient!.readContract({
            ...contracts.disputeResolver,
            functionName: "hasJoinedDispute",
            args: [BigInt(bountyId), twitchIdHash],
          });
          if (alreadyUsed) throw new Error("This Twitch account has already been used to vote on this dispute.");
        }

        // Join the dispute group
        setStatus("joining");
        setStatusText("Joining dispute group...");
        const revealedChunks = proofData.results.map((r) =>
          toHex(new TextEncoder().encode(r.value)),
        );
        await writeContractAsync({
          ...contracts.disputeResolver,
          functionName: "joinDisputeGroup",
          args: [
            BigInt(bountyId),
            [{
              signature: attestation.signature,
              attestationHash: attestation.attestationHash,
              serverDomain: attestation.serverDomain,
              timestamp: BigInt(attestation.timestamp),
              commitments: attestation.commitments,
              revealedChunks,
              salts: attestation.salts,
              chunkIndices: attestation.chunkIndices.map((i) => BigInt(i)),
            }],
            attestation.serverDomain === "gql.twitch.tv" ? "vedal987" : "",
            identity.commitment,
          ],
        });
      }

      // Wait for subgraph to index our membership
      setStatus("voting");
      setStatusText("Waiting for registration to sync...");
      let members: bigint[] = [];
      for (let poll = 0; poll < 10; poll++) {
        members = await fetchDisputeVoters(bountyId);
        if (members.includes(identity.commitment)) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!members.includes(identity.commitment)) {
        throw new Error("Timed out waiting for registration to be indexed. Try again in a moment.");
      }

      // Cast anonymous vote with retry for root mismatches
      setStatusText("Generating zero-knowledge proof...");
      for (let attempt = 0; attempt < MAX_VOTE_RETRIES; attempt++) {
        members = await fetchDisputeVoters(bountyId);
        const semaphoreProof = await generateVoteProof(identity, members, bountyId, vote);

        try {
          setStatusText("Submitting vote...");
          await writeContractAsync({
            ...contracts.disputeResolver,
            functionName: "castVote",
            args: [
              BigInt(bountyId),
              {
                merkleTreeDepth: BigInt(semaphoreProof.merkleTreeDepth),
                merkleTreeRoot: BigInt(semaphoreProof.merkleTreeRoot),
                nullifier: BigInt(semaphoreProof.nullifier),
                message: BigInt(semaphoreProof.message),
                scope: BigInt(semaphoreProof.scope),
                points: semaphoreProof.points.map((p) => BigInt(p)) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
              },
            ],
          });

          localStorage.setItem(voteKey, "1");
          setStatus("done");
          onSuccess?.();
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if ((msg.includes("MerkleTreeRoot") || msg.includes("InvalidProof")) && attempt < MAX_VOTE_RETRIES - 1) continue;
          throw err;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  }, [bountyId, signMessageAsync, writeContractAsync, publicClient, voteKey, onSuccess]);

  const resolveTx = useActionTx();
  useEffect(() => { if (resolveTx.isSuccess) onSuccess?.(); }, [resolveTx.isSuccess, onSuccess]);

  const votingActive = dispute && (dispute.status === "Voting" || dispute.status === "Extended");
  const timeLeft = dispute ? Math.max(0, dispute.votingEnd - Math.floor(Date.now() / 1000)) : 0;
  const votingEnded = votingActive && timeLeft === 0;
  const hoursLeft = Math.floor(timeLeft / 3600);
  const daysLeft = Math.floor(hoursLeft / 24);
  const busy = status !== "idle" && status !== "done";

  return (
    <div className="space-y-5">
      {/* Dispute info */}
      {dispute && votingActive && (
        <div className="flex items-center justify-between rounded-xl bg-surface-dim px-4 py-3">
          <div className="flex gap-6 text-sm">
            <span className="text-on-surface-muted">
              Approve{" "}
              <span className="font-bold text-secondary">{dispute.approveCount}</span>
            </span>
            <span className="text-on-surface-muted">
              Reject{" "}
              <span className="font-bold text-error">{dispute.rejectCount}</span>
            </span>
          </div>
          <span className="text-xs text-outline">
            {daysLeft > 0 ? `${daysLeft}d ${hoursLeft % 24}h left` : `${hoursLeft}h left`}
          </span>
        </div>
      )}

      {/* Vote buttons — visible when idle and voting still active */}
      {status === "idle" && !votingEnded && (
        <>
          <p className="text-sm text-on-surface-muted">
            This bounty is in dispute. Vote on whether the deliverable meets the requirements.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleVote(1)}
              disabled={busy}
              className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
            >
              Vote: Approve
            </button>
            <button
              onClick={() => handleVote(0)}
              disabled={busy}
              className="rounded-full border border-error/30 bg-error/5 px-6 py-3 text-sm font-bold text-error font-headline hover:bg-error/10 transition-all disabled:opacity-50"
            >
              Vote: Reject
            </button>
          </div>
        </>
      )}

      {/* Progress indicator */}
      {busy && (
        <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
          <p className="text-sm font-medium text-secondary">{statusText}</p>
          <p className="text-xs text-on-surface-muted mt-1">
            This may take a moment. Your vote will be anonymous.
          </p>
        </div>
      )}

      {/* Done */}
      {status === "done" && (
        <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
          <p className="text-sm font-medium text-secondary">Vote submitted!</p>
          <p className="text-xs text-on-surface-muted mt-1">
            Your anonymous vote has been recorded on-chain.
          </p>
        </div>
      )}

      {/* Voting ended — show results + resolve button */}
      {votingEnded && dispute && !resolveTx.isSuccess && (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-dim p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
              Voting ended — results
            </p>
            <div className="flex gap-6 text-sm">
              <span className="text-on-surface-muted">
                Approve{" "}
                <span className="font-bold text-secondary">{dispute.approveCount}</span>
              </span>
              <span className="text-on-surface-muted">
                Reject{" "}
                <span className="font-bold text-error">{dispute.rejectCount}</span>
              </span>
            </div>
            <p className={`text-sm font-medium ${dispute.approveCount > dispute.rejectCount ? "text-secondary" : "text-error"}`}>
              {dispute.approveCount > dispute.rejectCount
                ? "Dev wins — deliverable approved by community"
                : dispute.rejectCount > dispute.approveCount
                  ? "Sponsor wins — deliverable rejected by community"
                  : "Tie — will escalate to admin resolution"}
            </p>
          </div>
          <button
            onClick={() => resolveTx.writeContract({
              ...contracts.disputeResolver,
              functionName: "resolveDispute",
              args: [BigInt(bountyId)],
            })}
            disabled={resolveTx.isPending || resolveTx.isConfirming}
            className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
          >
            {resolveTx.isPending || resolveTx.isConfirming ? "Resolving..." : "Finalize Dispute"}
          </button>
        </div>
      )}

      {resolveTx.isSuccess && (
        <p className="text-sm text-secondary font-medium">Dispute resolved!</p>
      )}

      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}

// ─── Resolve dispute ────────────────────────────────────────────────

function ResolvedDisputeSection({ dispute }: { dispute: NonNullable<Bounty["dispute"]> }) {
  const devWins = dispute.approveCount > dispute.rejectCount;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold ${devWins ? "text-secondary" : "text-error"}`}>
          {devWins ? "Dev wins" : "Sponsor wins"} — dispute resolved
        </span>
      </div>
      <div className="flex gap-6 text-sm">
        <span className="text-on-surface-muted">
          Approve <span className="font-bold text-secondary">{dispute.approveCount}</span>
        </span>
        <span className="text-on-surface-muted">
          Reject <span className="font-bold text-error">{dispute.rejectCount}</span>
        </span>
      </div>
      <p className="text-xs text-on-surface-muted">
        {devWins
          ? "Funds released to the dev. Bond returned."
          : "Funds returned to the sponsor. Dev bond forfeited."}
      </p>
    </div>
  );
}

// ─── Claim expired bounty ───────────────────────────────────────────

function ClaimExpiredSection({ bountyId, onSuccess }: { bountyId: number; onSuccess?: () => void }) {
  const { writeContract, isPending, isConfirming, isSuccess } = useActionTx();

  useEffect(() => { if (isSuccess) onSuccess?.(); }, [isSuccess, onSuccess]);

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
