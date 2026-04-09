"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { useEscrowConfig } from "@/lib/hooks";
import { fetchBounty, type SubgraphBounty } from "@/lib/subgraph";
import {
  formatEurc,
  formatDeadline,
  formatDate,
  ZERO_ADDRESS,
  type Bounty,
  type BountyCategory,
  type Application,
} from "@/lib/types";
import type { BountyMetadata } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { CategoryBadge } from "@/components/CategoryBadge";
import { ActionPanel } from "@/components/ActionPanel";
import { ApplicationList } from "@/components/ApplicationList";
import { RewardDisplay } from "@/components/RewardDisplay";
import Link from "next/link";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (["http:", "https:"].includes(parsed.protocol)) return url;
  } catch {}
  return null;
}

export default function BountyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const bountyId = Number(id);
  const searchParams = useSearchParams();
  const mockDisputed = searchParams.get("mock") === "disputed";
  const mockExpired = searchParams.get("mock") === "expired";
  const { address } = useAccount();

  const { config: escrowConfig } = useEscrowConfig();

  const [onChain, setOnChain] = useState<SubgraphBounty | null>(null);
  const [metadata, setMetadata] = useState<BountyMetadata | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchApplications = useCallback(() => {
    fetch(`/api/bounties/${bountyId}/applications`)
      .then((r) => r.json())
      .then((rows: { address: string; message: string; applied_at: string }[]) =>
        setApplications(
          rows.map((r) => ({
            address: r.address,
            message: r.message,
            appliedAt: r.applied_at,
          }))
        )
      )
      .catch(() => {});
  }, [bountyId]);

  const patchBounty = useCallback((patch: Partial<SubgraphBounty>) => {
    setOnChain((prev) => prev ? { ...prev, ...patch } : prev);
  }, []);

  useEffect(() => {
    Promise.all([
      fetchBounty(bountyId).then(setOnChain),
      fetch(`/api/bounties/${bountyId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setMetadata),
      fetchApplications(),
    ]).finally(() => setIsLoading(false));
  }, [bountyId, fetchApplications]);

  // Keep trying to load subgraph data in background if it wasn't ready on first load
  useEffect(() => {
    if (!isLoading && !onChain && metadata) {
      const interval = setInterval(() => {
        fetchBounty(bountyId).then((b) => {
          if (b && b.sponsor !== ZERO_ADDRESS) {
            setOnChain(b);
            clearInterval(interval);
          }
        });
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isLoading, onChain, metadata, bountyId]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-12">
        <div className="rounded-[2rem] bg-surface p-12 animate-pulse h-64" />
      </div>
    );
  }

  if (!onChain && !metadata) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-12 text-center">
        <h1 className="text-2xl font-bold text-on-surface font-headline">
          Bounty not found
        </h1>
        <Link href="/" className="text-secondary mt-4 inline-block">
          &larr; Back to bounties
        </Link>
      </div>
    );
  }

  // Render optimistically: use subgraph data if available, fall back to metadata + defaults
  const hasOnChain = onChain && onChain.sponsor !== ZERO_ADDRESS;

  const title = metadata?.title ?? `Bounty #${bountyId}`;
  const description = metadata?.description ?? "";
  const category = (metadata?.category ?? "Other") as BountyCategory;
  const bondBps = escrowConfig?.bondPercentageBps ?? 500;
  const reviewDays = escrowConfig
    ? Math.floor(escrowConfig.reviewWindow / 86400)
    : 14;

  const sponsor = hasOnChain ? onChain.sponsor : (address ?? ZERO_ADDRESS);
  const dev = hasOnChain ? onChain.dev : null;
  const reward = hasOnChain ? BigInt(onChain.reward) : 0n;
  const status = hasOnChain
    ? (mockDisputed ? "Disputed" : onChain.status as Bounty["status"])
    : "Open" as Bounty["status"];
  const deadline = hasOnChain ? Number(onChain.deadline) : 0;
  const submissionTime = hasOnChain ? Number(onChain.submissionTime ?? "0") : 0;
  const proofURI = hasOnChain ? onChain.proofURI : null;

  const bounty: Bounty = {
    id: bountyId,
    title,
    description,
    category,
    sponsor,
    dev,
    reward,
    bond: hasOnChain ? BigInt(onChain.bond ?? "0") : 0n,
    deadline,
    bondStakeDeadline: hasOnChain ? Number(onChain.bondStakeDeadline ?? "0") : 0,
    submissionTime,
    descriptionHash: "",
    proofURIHash: "",
    status,
    createdAt: metadata?.created_at ?? "",
    dispute: hasOnChain && onChain.dispute
      ? {
          votingEnd: mockExpired ? Math.floor(Date.now() / 1000) - 60 : Number(onChain.dispute.votingEnd),
          approveCount: onChain.dispute.approveCount,
          rejectCount: onChain.dispute.rejectCount,
          status: onChain.dispute.status,
          extended: onChain.dispute.extended,
        }
      : null,
  };

  const reviewDeadlineTs = submissionTime
    ? submissionTime + (escrowConfig?.reviewWindow ?? 1_209_600)
    : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 sm:px-12">
      {/* Breadcrumb */}
      <nav className="mb-8 animate-fade-up" style={{ animationDelay: "0ms" }}>
        <Link
          href="/"
          className="text-sm text-on-surface-muted hover:text-secondary transition-colors"
        >
          &larr; Back to bounties
        </Link>
      </nav>

      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary-container/40 to-secondary-container/20 p-10 sm:p-12 animate-fade-up"
        style={{ animationDelay: "50ms" }}
      >
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={category} />
              <StatusBadge status={status} />
            </div>

            <h1 className="text-3xl font-extrabold text-on-surface font-headline leading-tight sm:text-4xl">
              {title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-on-surface-muted">
              <span>
                Sponsor{" "}
                <span className="font-medium text-on-surface">
                  {truncateAddress(sponsor)}
                </span>
              </span>
              {dev && (
                <span>
                  Dev{" "}
                  <span className="font-medium text-on-surface">
                    {truncateAddress(dev)}
                  </span>
                </span>
              )}
              {metadata?.created_at && (
                <span>Posted {metadata.created_at}</span>
              )}
              {status === "Open" || status === "Applied" ? (
                <span className="font-medium text-on-surface-muted">
                  {Math.floor(deadline / 86400)} day time limit
                </span>
              ) : (
                <span className="font-medium text-error">
                  {formatDeadline(deadline)} left
                </span>
              )}
            </div>
          </div>

          <RewardDisplay amount={formatEurc(reward)} />
        </div>
      </div>

      {/* Content grid */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Description */}
          {description && (
            <div
              className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)] animate-fade-up"
              style={{ animationDelay: "150ms" }}
            >
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
                Description
              </h2>
              <p className="whitespace-pre-wrap leading-relaxed text-on-surface-subtle">
                {description}
              </p>
            </div>
          )}

          {/* Deliverable */}
          {proofURI && ["Submitted", "Disputed", "Approved", "Resolved"].includes(status) && (
              <div
                className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)] animate-fade-up"
                style={{ animationDelay: "200ms" }}
              >
                <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
                  Deliverable
                </h2>
                {sanitizeUrl(proofURI!) ? (
                  <a
                    href={sanitizeUrl(proofURI!)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-secondary hover:underline break-all"
                  >
                    {proofURI!.length > 200 ? `${proofURI!.slice(0, 200)}...` : proofURI}
                  </a>
                ) : (
                  <p className="text-sm text-on-surface-muted break-all">{proofURI}</p>
                )}
                {status === "Submitted" && reviewDeadlineTs > 0 && (
                  <p className="mt-3 text-sm text-error font-medium">
                    Review period: {formatDeadline(reviewDeadlineTs)} remaining
                  </p>
                )}
              </div>
            )}

          {/* Actions */}
          <div
            className="animate-fade-up"
            style={{ animationDelay: "250ms" }}
          >
            <ActionPanel bounty={bounty} applications={applications} onApplicationSubmitted={fetchApplications} onBountyChanged={patchBounty} />
          </div>

          {/* Applications */}
          {status === "Open" && applications.length > 0 && (
            <div
              className="animate-fade-up"
              style={{ animationDelay: "300ms" }}
            >
              <ApplicationList
                applications={applications}
                isSponsor={address?.toLowerCase() === sponsor.toLowerCase()}
                bountyId={bountyId}
                onBountyChanged={() => patchBounty({ status: "Applied" })}
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div
          className="space-y-6 animate-fade-up"
          style={{ animationDelay: "200ms" }}
        >
          {/* Details */}
          <div className="rounded-[2rem] bg-surface p-6 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
              Details
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-on-surface-muted">Sponsor</dt>
                <dd className="font-medium text-on-surface">
                  {truncateAddress(sponsor)}
                </dd>
              </div>
              {dev && (
                <div className="flex justify-between">
                  <dt className="text-on-surface-muted">Dev</dt>
                  <dd className="font-medium text-on-surface">
                    {truncateAddress(dev)}
                  </dd>
                </div>
              )}
              <div className="h-px bg-border-subtle" />
              {metadata?.created_at && (
                <div className="flex justify-between">
                  <dt className="text-on-surface-muted">Posted</dt>
                  <dd className="text-on-surface-subtle">
                    {metadata.created_at}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-on-surface-muted">Time limit</dt>
                <dd className="text-on-surface-subtle">
                  {status === "Open" || status === "Applied"
                    ? `${Math.floor(deadline / 86400)} days`
                    : formatDeadline(deadline)}
                </dd>
              </div>
              <div className="h-px bg-border-subtle" />
              <div className="flex justify-between">
                <dt className="text-on-surface-muted">Bond</dt>
                <dd className="text-on-surface-subtle">
                  {bondBps / 100}%
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-muted">Review window</dt>
                <dd className="text-on-surface-subtle">{reviewDays} days</dd>
              </div>
            </dl>
          </div>

          {/* Timeline */}
          <div className="rounded-[2rem] bg-surface p-6 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
              Timeline
            </h3>
            <div className="space-y-0">
              <TimelineStep
                label="Created"
                date={metadata?.created_at}
                completed
              />
              <TimelineStep
                label="Dev Assigned"
                completed={!!dev}
              />
              <TimelineStep
                label="Submitted"
                completed={[
                  "Submitted",
                  "Approved",
                  "Disputed",
                  "Resolved",
                ].includes(status)}
              />
              {(status === "Disputed" || (status === "Resolved" && bounty.dispute)) && (
                <TimelineStep
                  label="Disputed"
                  completed
                />
              )}
              <TimelineStep
                label="Resolved"
                completed={
                  status === "Approved" ||
                  status === "Resolved"
                }
                last
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineStep({
  label,
  date,
  completed,
  last,
}: {
  label: string;
  date?: string;
  completed: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`h-3 w-3 rounded-full border-2 ${
            completed
              ? "border-secondary bg-secondary"
              : "border-outline-variant bg-transparent"
          }`}
        />
        {!last && (
          <div
            className={`w-px flex-1 min-h-6 ${
              completed ? "bg-secondary/30" : "bg-border-subtle"
            }`}
          />
        )}
      </div>
      <div className="pb-4">
        <p
          className={`text-sm ${
            completed ? "text-on-surface font-medium" : "text-on-surface-muted"
          }`}
        >
          {label}
        </p>
        {date && <p className="text-xs text-outline">{date}</p>}
      </div>
    </div>
  );
}
