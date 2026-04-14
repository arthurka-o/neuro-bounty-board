"use client";

import { OpenfortButton } from "@openfort/react";
import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border-subtle">
      <div className="mx-auto flex h-20 max-w-[1920px] items-center justify-between px-6 sm:px-12">
        <div className="flex items-center gap-10">
          <Link
            href="/"
            className="text-2xl font-extrabold tracking-tighter text-primary font-headline"
          >
            Neuro Bounty Board
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium font-headline sm:flex">
            <Link
              href="/"
              className="text-secondary font-bold border-b-2 border-secondary pb-1 transition-colors"
            >
              Bounties
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/create"
            className="hidden sm:inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container px-6 py-2.5 rounded-full text-sm font-bold font-headline shadow-sm hover:shadow-md hover:brightness-95 transition-all active:scale-95"
          >
            <span className="text-base leading-none">+</span>
            Post Bounty
          </Link>
          <OpenfortButton />
        </div>
      </div>
    </header>
  );
}
