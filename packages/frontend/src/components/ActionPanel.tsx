"use client";

import { useState, useCallback } from "react";
import { Bounty, formatDeadline } from "@/lib/types";
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

export function ActionPanel({ bounty, onApplicationSubmitted }: { bounty: Bounty; onApplicationSubmitted?: () => void }) {
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
        <ApplySection bountyId={bounty.id} onSuccess={onApplicationSubmitted} />
      )}

      {bounty.status === "Open" && isSponsor && (
        <CancelSection bountyId={bounty.id} />
      )}

      {bounty.status === "Applied" && isSponsor && (
        <p className="text-sm text-on-surface-muted">
          A dev has been approved. Waiting for them to stake their bond.
        </p>
      )}

      {bounty.status === "Applied" && isDev && (
        <StakeBondSection bountyId={bounty.id} reward={bounty.reward} />
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
        <VoteSection bountyId={bounty.id} dispute={bounty.dispute} />
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

function ApplySection({ bountyId, onSuccess }: { bountyId: number; onSuccess?: () => void }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState(false);
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
      setApplied(true);
      onSuccess?.();
    } catch {}
    setSubmitting(false);
  }

  if (applied) {
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

// ─── Stake Bond ─────────────────────────────────────────────────────

function StakeBondSection({ bountyId, reward }: { bountyId: number; reward: bigint }) {
  const { address } = useAccount();
  const approveTx = useActionTx();
  const stakeTx = useActionTx();

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

type VoteStep = "prove" | "join" | "vote" | "done";

function VoteSection({ bountyId, dispute }: { bountyId: number; dispute?: Bounty["dispute"] }) {

  const [proof, setProof] = useState<TLSNProof | null>(null);
  const [proving, setProving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [voting, setVoting] = useState(false);

  // Check localStorage for prior vote (temporary until on-chain nullifier check)
  const voteKey = `voted:${bountyId}`;
  const alreadyVoted = typeof window !== "undefined" && localStorage.getItem(voteKey) !== null;
  const [step, setStep] = useState<VoteStep>(alreadyVoted ? "done" : "prove");

  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const hasExtension = typeof window !== "undefined" && !!window.tlsn;
  const hasAttestation = !!proof?.attestation;

  // Step 1: Generate TLSNotary proof
  const handleProve = useCallback(async () => {
    setError(null);
    setProving(true);
    try {
      if (!window.tlsn) throw new Error("TLSNotary extension not found");

      // Generate correlationId so the verifier stores the attestation for us
      const correlationId = `vote_${bountyId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const pluginCode = await fetch("/plugins/twitch_sub.js").then((r) => r.text());
      const result = await window.tlsn.execCode(pluginCode, {
        requestId: correlationId,
        sessionData: { correlationId },
      });
      const proofData: TLSNProof = JSON.parse(result);

      // Poll the verifier for the signed attestation
      const attestationData = await pollForAttestation(correlationId);
      proofData.attestation = attestationData;

      setProof(proofData);

      // Check if this Twitch account already joined this dispute
      const idMatch = proofData.results
        .map((r) => r.value)
        .join("")
        .match(/"id":"(\d+)"/);
      if (idMatch) {
        const twitchIdHash = keccak256(encodePacked(["string"], [idMatch[1]]));
        const alreadyJoined = await publicClient!.readContract({
          ...contracts.disputeResolver,
          functionName: "hasJoinedDispute",
          args: [BigInt(bountyId), twitchIdHash],
        });
        if (alreadyJoined) {
          setError("This Twitch account has already voted on this dispute.");
          return;
        }
      }

      setStep("join");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProving(false);
    }
  }, [bountyId]);

  // Two-step voting: 1) join group (public), 2) cast vote (anonymous via relayer later)
  // TODO: Step 2 should go through a batching relayer for true vote anonymity.
  // The relayer should collect votes and submit them in randomized batches
  // to prevent timing correlation attacks.
  const handleJoinAndVote = useCallback(async (vote: 0 | 1) => {
    if (!proof?.attestation) return;
    setError(null);
    setJoining(true);

    try {
      const { getOrCreateIdentity, generateVoteProof } = await getSemaphore();
      const identity = await getOrCreateIdentity(signMessageAsync);

      // Check if already joined (e.g. join succeeded but vote failed on previous attempt)
      const existingMembers = await fetchDisputeVoters(bountyId);
      const alreadyJoined = existingMembers.includes(identity.commitment);

      if (!alreadyJoined) {
        const att = proof.attestation;
        const revealedChunks = proof.results.map((r) =>
          toHex(new TextEncoder().encode(r.value)),
        );

        const presentation = {
          signature: att.signature,
          attestationHash: att.attestationHash,
          serverDomain: att.serverDomain,
          timestamp: BigInt(att.timestamp),
          commitments: att.commitments,
          revealedChunks,
          salts: att.salts,
          chunkIndices: att.chunkIndices.map((i) => BigInt(i)),
        };

        // Step 1: Join dispute group (public — links Twitch identity to commitment)
        await writeContractAsync({
          ...contracts.disputeResolver,
          functionName: "joinDisputeGroup",
          args: [
            BigInt(bountyId),
            [presentation],
            att.serverDomain === "gql.twitch.tv" ? "vedal987" : "",
            identity.commitment,
          ],
        });
      }

      setStep("vote");
      setJoining(false);
      setVoting(true);

      // Step 2: Cast anonymous vote
      // Retry loop: if someone else joins between proof generation and tx mining,
      // the root won't match. wagmi simulates first (eth_call), so it fails
      // before spending gas. We retry with a fresh member list.
      for (let attempt = 0; attempt < MAX_VOTE_RETRIES; attempt++) {
        // Re-fetch members (our join tx may have just been indexed)
        const members = await fetchDisputeVoters(bountyId);

        const semaphoreProof = await generateVoteProof(
          identity,
          members,
          bountyId,
          vote,
        );

        try {
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
          setStep("done");
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isRootMismatch = msg.includes("MerkleTreeRoot") || msg.includes("InvalidProof");
          if (isRootMismatch && attempt < MAX_VOTE_RETRIES - 1) {
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(false);
      setVoting(false);
    }
  }, [proof, bountyId, signMessageAsync, writeContractAsync]);

  const votingActive = dispute && (dispute.status === "Voting" || dispute.status === "Extended");
  const timeLeft = dispute ? Math.max(0, dispute.votingEnd - Math.floor(Date.now() / 1000)) : 0;
  const hoursLeft = Math.floor(timeLeft / 3600);
  const daysLeft = Math.floor(hoursLeft / 24);
  const busy = proving || joining || voting;

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

      {/* Step 1: Prove subscription */}
      {step === "prove" && (
        <>
          <p className="text-sm text-on-surface-muted">
            This bounty is in dispute. To vote, prove you&apos;re subscribed to the channel.
          </p>

          {!hasExtension ? (
            <div className="rounded-xl border border-border bg-surface-dim p-4 text-sm text-on-surface-muted">
              <p className="font-medium text-on-surface mb-1">TLSNotary extension required</p>
              <p>Install the TLSNotary browser extension to generate a subscription proof.</p>
            </div>
          ) : (
            <button
              onClick={handleProve}
              disabled={proving}
              className="rounded-full bg-[#9146FF] text-white px-6 py-3 text-sm font-bold font-headline hover:brightness-110 transition-all active:scale-95 disabled:opacity-50"
            >
              {proving ? "Generating proof..." : "Prove Twitch Subscription"}
            </button>
          )}
        </>
      )}

      {/* Step 2: Proof ready — show result + vote buttons */}
      {step === "join" && proof && (
        <>
          <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
            <p className="text-sm font-medium text-secondary mb-1">Subscription verified</p>
            {hasAttestation ? (
              <p className="text-xs text-on-surface-muted">
                Signed by notary &mdash; ready to submit on-chain
              </p>
            ) : (
              <p className="text-xs text-error">
                No attestation found. The notary server may not have signing enabled.
              </p>
            )}
          </div>

          {hasAttestation && (
            <>
              <p className="text-sm text-on-surface-muted">
                Vote on whether the deliverable meets the bounty requirements.
                This will sign a message, join the dispute group, and cast your anonymous vote.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleJoinAndVote(1)}
                  disabled={busy}
                  className="rounded-full bg-secondary-container text-on-secondary-container px-6 py-3 text-sm font-bold font-headline hover:brightness-95 transition-all active:scale-95 disabled:opacity-50"
                >
                  {joining ? "Joining group..." : voting ? "Casting vote..." : "Vote: Approve"}
                </button>
                <button
                  onClick={() => handleJoinAndVote(0)}
                  disabled={busy}
                  className="rounded-full border border-error/30 bg-error/5 px-6 py-3 text-sm font-bold text-error font-headline hover:bg-error/10 transition-all disabled:opacity-50"
                >
                  {joining ? "Joining group..." : voting ? "Casting vote..." : "Vote: Reject"}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Step 3: Voting in progress */}
      {step === "vote" && (
        <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
          <p className="text-sm font-medium text-secondary">Generating zero-knowledge proof...</p>
          <p className="text-xs text-on-surface-muted mt-1">
            This may take a moment. Your vote will be anonymous.
          </p>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && (
        <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
          <p className="text-sm font-medium text-secondary">Vote submitted!</p>
          <p className="text-xs text-on-surface-muted mt-1">
            Your anonymous vote has been recorded on-chain.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      {/* Debug: raw proof data */}
      {proof && (
        <details className="text-xs">
          <summary className="cursor-pointer text-outline hover:text-on-surface-muted transition-colors">
            Raw proof data
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-dim p-3 text-[10px] leading-relaxed text-on-surface-muted">
            {JSON.stringify(proof, null, 2)}
          </pre>
        </details>
      )}
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
