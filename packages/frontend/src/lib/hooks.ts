"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { contracts } from "./contracts";
import { BOUNTY_STATUS_LABELS, ZERO_ADDRESS } from "./types";
import type { BountyStatus } from "./types";

// ─── Read single bounty from chain ──────────────────────────────────

type OnChainBounty = {
  sponsor: string;
  dev: string | null;
  reward: bigint;
  bond: bigint;
  deadline: number;
  bondStakeDeadline: number;
  submissionTime: number;
  descriptionHash: string;
  proofURIHash: string;
  status: BountyStatus;
};

export function useOnChainBounty(bountyId: number) {
  const result = useReadContract({
    ...contracts.bountyEscrow,
    functionName: "getBounty",
    args: [BigInt(bountyId)],
  });

  if (!result.data) return { ...result, bounty: null };

  const raw = result.data as unknown as {
    sponsor: string;
    dev: string;
    reward: bigint;
    bond: bigint;
    deadline: bigint;
    bondStakeDeadline: bigint;
    submissionTime: bigint;
    descriptionHash: string;
    proofURIHash: string;
    status: number;
  };

  const bounty: OnChainBounty = {
    sponsor: raw.sponsor,
    dev: raw.dev === ZERO_ADDRESS ? null : raw.dev,
    reward: raw.reward,
    bond: raw.bond,
    deadline: Number(raw.deadline),
    bondStakeDeadline: Number(raw.bondStakeDeadline),
    submissionTime: Number(raw.submissionTime),
    descriptionHash: raw.descriptionHash,
    proofURIHash: raw.proofURIHash,
    status: BOUNTY_STATUS_LABELS[raw.status] ?? "Open",
  };

  return { ...result, bounty };
}

// ─── Read escrow config ─────────────────────────────────────────────

export function useEscrowConfig() {
  const result = useReadContracts({
    contracts: [
      { ...contracts.bountyEscrow, functionName: "bondPercentageBps" },
      { ...contracts.bountyEscrow, functionName: "reviewWindow" },
      { ...contracts.bountyEscrow, functionName: "bondStakeWindow" },
      { ...contracts.bountyEscrow, functionName: "nextBountyId" },
    ],
  });

  if (!result.data) return { ...result, config: null };

  return {
    ...result,
    config: {
      bondPercentageBps: Number(result.data[0].result ?? 500),
      reviewWindow: Number(result.data[1].result ?? 1_209_600),
      bondStakeWindow: Number(result.data[2].result ?? 259_200),
      nextBountyId: Number(result.data[3].result ?? 0),
    },
  };
}

// ─── Read dispute ───────────────────────────────────────────────────

export function useDispute(bountyId: number) {
  const result = useReadContract({
    ...contracts.disputeResolver,
    functionName: "getDispute",
    args: [BigInt(bountyId)],
  });

  if (!result.data) return { ...result, dispute: null };

  const raw = result.data as unknown as {
    votingStart: bigint;
    votingEnd: bigint;
    approveCount: bigint;
    rejectCount: bigint;
    status: number;
    extended: boolean;
  };

  return {
    ...result,
    dispute: {
      bountyId,
      votingStart: Number(raw.votingStart),
      votingEnd: Number(raw.votingEnd),
      approveCount: Number(raw.approveCount),
      rejectCount: Number(raw.rejectCount),
      status: raw.status,
      extended: raw.extended,
    },
  };
}
