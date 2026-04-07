"use client";

import { Application } from "@/lib/types";

type Props = {
  applications: Application[];
  isSponsor: boolean;
  bountyId: number;
};

export function ApplicationList({ applications, isSponsor }: Props) {
  return (
    <div className="rounded-[2rem] bg-surface p-8 shadow-[0_16px_32px_rgba(115,81,102,0.03)]">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-muted font-headline">
        Applications ({applications.length})
      </h2>

      <div className="space-y-3">
        {applications.map((app) => (
          <div
            key={app.address}
            className="rounded-lg border border-border-subtle bg-surface-dim p-5 transition-colors hover:border-primary-container"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-on-surface">
                  {app.address}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-on-surface-muted">
                  {app.message}
                </p>
                <p className="mt-2 text-xs text-outline">
                  Applied {app.appliedAt}
                </p>
              </div>
              {isSponsor && (
                <button className="shrink-0 rounded-full bg-secondary-container text-on-secondary-container px-5 py-2 text-xs font-bold font-headline hover:brightness-95 transition-all active:scale-95">
                  Approve Dev
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
