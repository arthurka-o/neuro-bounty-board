# Neuro Bounty Board

Trustless, community-funded bounty board for VTuber communities (Neuro-sama ecosystem). See `docs/SPEC.md` for full architecture and `docs/reclaim-reference.md` for Reclaim Protocol integration details. See `docs/semaphore-reference.md` for Semaphore V4 integration reference (identity, groups, proofs, on-chain contracts, deployed addresses).

## Project Structure

pnpm monorepo with two packages:

```
packages/contracts/   — Foundry (Solidity) smart contracts
packages/frontend/    — Next.js 16 + Tailwind CSS + wagmi/RainbowKit
```

## Tooling

- **mise** for dev tool management (node 22, pnpm 10). Config in `mise.toml`.
- **Foundry** for contracts (installed via foundryup, not mise).
- Run tools via `mise exec -- <command>` (e.g., `mise exec -- pnpm ...`). The Bash shell does not inherit the user's fish PATH.
- forge-std is a git submodule at `packages/contracts/lib/forge-std`.

## Frontend

- **Stack:** Next.js App Router, Tailwind CSS v4, wagmi v2, viem, RainbowKit v2, @tanstack/react-query.
- **Fonts:** Plus Jakarta Sans (headings, `font-headline`), Be Vietnam Pro (body, `font-sans`). Loaded via next/font.
- **Design:** Warm light theme derived from a Stitch-generated Material 3 palette. Key colors defined as CSS custom properties in `globals.css`:
  - Background: `#fdf5eb` (warm cream)
  - Primary: `#735166` (dusty mauve)
  - Secondary: `#00675c` (deep teal) — used for rewards, CTAs
  - Tertiary: `#a02d70` (hot pink)
  - Error: `#b41340`
- **Cards:** Use `rounded-[2rem]`, white bg (`bg-surface`), soft shadows.
- **Rewards:** Display as `€{amount}` in UI (EURC on-chain, abstracted away from users).
- **Shared constants** in `src/lib/types.ts`: `BOUNTY_CATEGORIES`, `DEADLINE_OPTIONS`, plus all TypeScript types.
- **Mock data** in `src/lib/mock-data.ts` — will be replaced with contract reads.
- Arthur has full autonomy delegated to Claude for frontend. No review needed on frontend code.

## Contracts

- **Chain:** Optimism mainnet for testing (Ethereum mainnet for production).
- **Currency:** EURC (Circle's Euro stablecoin, ERC-20).
- **Contracts:** BountyEscrow.sol, DisputeResolver.sol, VoterRegistry.sol — all UUPS upgradeable.
- **External contracts on Optimism:**
  - Semaphore V4: `0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D`
  - Reclaim Verifier: `0xB238380c4C6C1a7eD9E1808B1b6fcb3F1B2836cF`
- Arthur handles contract review. See SPEC.md for full contract interface spec.

## Current Status

### Done
- Monorepo scaffold (pnpm workspace, Foundry, Next.js)
- Wallet connection (wagmi + RainbowKit)
- Bounty listing page with category filter, stats, CTA card
- Bounty detail page with description, sidebar (details + timeline), action panel, application list
- Create bounty page with form (title, description, category, reward, deadline)
- All pages use mock data

### Next Up (Phase 1 from spec)
- BountyEscrow.sol contract implementation
- Contract tests
- Wire frontend to contracts (replace mock data)

## Conventions

- Conventional commits (`feat:`, `fix:`, `chore:`, etc.). No Co-Authored-By lines.
- Commit per feature, only after manual testing by Arthur.
- Crypto should be invisible in the UI — no wallet jargon, no token names, just euros and buttons.
