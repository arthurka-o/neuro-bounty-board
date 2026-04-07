import { MOCK_BOUNTIES, MOCK_APPLICATIONS } from "@/lib/mock-data";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { CategoryBadge } from "@/components/CategoryBadge";
import { ActionPanel } from "@/components/ActionPanel";
import { ApplicationList } from "@/components/ApplicationList";
import { RewardDisplay } from "@/components/RewardDisplay";
import Link from "next/link";

export default async function BountyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bounty = MOCK_BOUNTIES.find((b) => b.id === Number(id));

  if (!bounty) return notFound();

  const applications = MOCK_APPLICATIONS[bounty.id] ?? [];

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
              <CategoryBadge category={bounty.category} />
              <StatusBadge status={bounty.status} />
            </div>

            <h1 className="text-3xl font-extrabold text-on-surface font-headline leading-tight sm:text-4xl">
              {bounty.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-on-surface-muted">
              <span>
                Sponsor{" "}
                <span className="font-medium text-on-surface">
                  {bounty.sponsor}
                </span>
              </span>
              {bounty.dev && (
                <span>
                  Dev{" "}
                  <span className="font-medium text-on-surface">
                    {bounty.dev}
                  </span>
                </span>
              )}
              <span>Posted {bounty.createdAt}</span>
              <span className="font-medium text-error">
                {bounty.deadline} left
              </span>
            </div>
          </div>

          <RewardDisplay amount={bounty.reward} />
        </div>
      </div>

      {/* Content grid */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Description */}
          <div
            className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)] animate-fade-up"
            style={{ animationDelay: "150ms" }}
          >
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
              Description
            </h2>
            <p className="whitespace-pre-wrap leading-relaxed text-on-surface-subtle">
              {bounty.description}
            </p>
          </div>

          {/* Deliverable */}
          {bounty.deliverableURI && (
            <div
              className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)] animate-fade-up"
              style={{ animationDelay: "200ms" }}
            >
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
                Deliverable
              </h2>
              <a
                href={bounty.deliverableURI}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-secondary hover:text-secondary/80 underline break-all transition-colors"
              >
                {bounty.deliverableURI}
              </a>
              {bounty.reviewDeadline && (
                <p className="mt-3 text-sm text-error font-medium">
                  Review deadline: {bounty.reviewDeadline} remaining
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div
            className="animate-fade-up"
            style={{ animationDelay: "250ms" }}
          >
            <ActionPanel bounty={bounty} />
          </div>

          {/* Applications */}
          {(bounty.status === "Open" || bounty.status === "Applied") &&
            applications.length > 0 && (
              <div
                className="animate-fade-up"
                style={{ animationDelay: "300ms" }}
              >
                <ApplicationList
                  applications={applications}
                  isSponsor={true}
                  bountyId={bounty.id}
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
                  {bounty.sponsor}
                </dd>
              </div>
              {bounty.dev && (
                <div className="flex justify-between">
                  <dt className="text-on-surface-muted">Dev</dt>
                  <dd className="font-medium text-on-surface">{bounty.dev}</dd>
                </div>
              )}
              <div className="h-px bg-border-subtle" />
              <div className="flex justify-between">
                <dt className="text-on-surface-muted">Posted</dt>
                <dd className="text-on-surface-subtle">{bounty.createdAt}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-muted">Deadline</dt>
                <dd className="text-on-surface-subtle">{bounty.deadline}</dd>
              </div>
              <div className="h-px bg-border-subtle" />
              <div className="flex justify-between">
                <dt className="text-on-surface-muted">Bond</dt>
                <dd className="text-on-surface-subtle">5%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-muted">Review window</dt>
                <dd className="text-on-surface-subtle">14 days</dd>
              </div>
            </dl>
          </div>

          {/* Timeline */}
          <div className="rounded-[2rem] bg-surface p-6 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
              Timeline
            </h3>
            <div className="space-y-0">
              <TimelineStep label="Created" date={bounty.createdAt} completed />
              <TimelineStep
                label="Dev Assigned"
                date={bounty.dev ? "assigned" : undefined}
                completed={!!bounty.dev}
              />
              <TimelineStep
                label="Submitted"
                date={
                  ["Submitted", "Approved", "Disputed", "Resolved"].includes(
                    bounty.status
                  )
                    ? "delivered"
                    : undefined
                }
                completed={[
                  "Submitted",
                  "Approved",
                  "Disputed",
                  "Resolved",
                ].includes(bounty.status)}
              />
              <TimelineStep
                label="Resolved"
                date={
                  bounty.status === "Approved" || bounty.status === "Resolved"
                    ? "complete"
                    : undefined
                }
                completed={
                  bounty.status === "Approved" || bounty.status === "Resolved"
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
