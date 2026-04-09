// ─── On-chain status (matches BountyEscrow.BountyStatus enum order) ───
export const BOUNTY_STATUS_LABELS = [
  "Open",
  "Active",
  "Submitted",
  "Approved",
  "Disputed",
  "Expired",
  "Cancelled",
  "Resolved",
] as const;

// "Applied" is a UI-only status: on-chain "Open" + has off-chain applications
export type BountyStatus =
  | (typeof BOUNTY_STATUS_LABELS)[number]
  | "Applied";

export const BOUNTY_CATEGORIES = [
  "Game Integration",
  "Art",
  "Tool",
  "Other",
] as const;

export type BountyCategory = (typeof BOUNTY_CATEGORIES)[number];

export const DEADLINE_OPTIONS = [
  { label: "2 weeks", days: 14 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
] as const;

// ─── Combined bounty (on-chain + off-chain) ──────────────────────────

export type Bounty = {
  id: number;
  // Off-chain (SQLite)
  title: string;
  description: string;
  category: BountyCategory;
  // On-chain
  sponsor: string;
  dev: string | null;
  reward: bigint; // raw EURC amount (6 decimals)
  bond: bigint;
  deadline: number; // unix timestamp
  bondStakeDeadline: number;
  submissionTime: number;
  descriptionHash: string;
  proofURIHash: string;
  status: BountyStatus;
  // Computed
  createdAt: string; // from SQLite
  // Dispute (from subgraph)
  dispute?: {
    votingEnd: number;
    approveCount: number;
    rejectCount: number;
    status: string;
    extended: boolean;
  } | null;
};

// ─── Display helpers ─────────────────────────────────────────────────

/** Format EURC amount (6 decimals) to human-readable euro string */
export function formatEurc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toLocaleString();
  // Show 2 decimal places
  const fracStr = frac.toString().padStart(6, "0").slice(0, 2);
  return `${whole.toLocaleString()}.${fracStr}`;
}

/** Format unix timestamp to relative time string */
export function formatDeadline(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(diff / 3600);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Format unix timestamp to date string */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Application (off-chain) ─────────────────────────────────────────

export type Application = {
  address: string;
  message: string;
  appliedAt: string;
};

// ─── Dispute (on-chain) ──────────────────────────────────────────────

export type Dispute = {
  bountyId: number;
  votingStart: number;
  votingEnd: number;
  approveCount: number;
  rejectCount: number;
  status: number; // 0=None, 1=Voting, 2=Extended, 3=Resolved, 4=Escalated
  extended: boolean;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
