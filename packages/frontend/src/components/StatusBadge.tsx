import { BountyStatus } from "@/lib/types";

const STYLES: Record<BountyStatus, string> = {
  Open: "bg-secondary-container/30 text-secondary",
  Applied: "bg-secondary-container/20 text-secondary",
  Active: "bg-primary-container text-primary",
  Submitted: "bg-tertiary-container/20 text-tertiary",
  Approved: "bg-secondary-container/30 text-secondary",
  Disputed: "bg-error/10 text-error",
  Resolved: "bg-surface-container text-on-surface-muted",
  Expired: "bg-surface-container text-outline",
  Cancelled: "bg-surface-container text-outline",
};

export function StatusBadge({ status }: { status: BountyStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider font-headline ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
