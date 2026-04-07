export type BountyStatus =
  | "Open"
  | "Applied"
  | "Active"
  | "Submitted"
  | "Approved"
  | "Disputed"
  | "Resolved"
  | "Expired"
  | "Cancelled";

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

export type Bounty = {
  id: number;
  title: string;
  description: string;
  category: BountyCategory;
  reward: string;
  status: BountyStatus;
  sponsor: string;
  dev: string | null;
  deadline: string;
  reviewDeadline: string | null;
  deliverableURI: string | null;
  createdAt: string;
};

export type Application = {
  address: string;
  message: string;
  appliedAt: string;
};

export type Dispute = {
  bountyId: number;
  approveCount: number;
  rejectCount: number;
  quorum: number;
  deadline: string;
  extended: boolean;
  resolved: boolean;
};
