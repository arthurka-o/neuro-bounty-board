# Neuro Bounty Board

Trustless, community-funded bounty board for VTuber communities (Neuro-sama ecosystem). See `docs/SPEC.md` for full architecture and `docs/tlsnotary-reference.md` for TLSNotary integration details.

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

- **Chain:** Base mainnet for testing (Ethereum mainnet for production).
- **Currency:** EURC (Circle's Euro stablecoin, ERC-20).
- **Contracts:** BountyEscrow.sol, DisputeResolver.sol (+ TLSNVerifier.sol library) — all UUPS upgradeable.
- **Identity:** TLSNotary MPC-TLS for Twitch subscription verification (replaces Reclaim Protocol).
- **External contracts on Base:**
  - Semaphore V4: `0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D`
  - EURC: `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42`
- Arthur handles contract review. See SPEC.md for full contract interface spec.

## Current Status

### Done
- Monorepo scaffold (pnpm workspace, Foundry, Next.js)
- Wallet connection (wagmi + RainbowKit, Base chain)
- Full bounty lifecycle UI: listing, detail, create, action panel, applications
- BountyEscrow.sol, DisputeResolver.sol (+ TLSNVerifier.sol library) — all UUPS upgradeable
- DisputeResolver: two-step voting — `joinDisputeGroup()` (public identity) + `castVote()` (anonymous ZK proof)
- TLSNotary MPC-TLS verification for Twitch subscription (sybil resistance)
- Contracts deployed and verified on Base mainnet (Sourcify)
- Subgraph (Goldsky) indexing all on-chain events, frontend reads from subgraph
- SQLite for off-chain metadata (title, description, category, applications)
- Frontend wired: create bounty, approve dev, stake bond, submit deliverable, approve/reject, vote on disputes
- TLSNotary verifier server deployed at notary.reyvon.gay

### Deployed Contracts (Base Mainnet)
- BountyEscrow proxy: `0x1005c4231E5A687F41A15277cEc416d4A9D3649e`
- DisputeResolver proxy: `0xF7bBF83bdA864b7298eeBfB509c887033226FaB4`

### Subgraph (Goldsky)

Indexed via Goldsky. Frontend uses the `latest` tag so no URL changes are needed on redeploy.

```bash
cd packages/subgraph

# 1. Bump version in package.json deploy:goldsky and tag:latest scripts
# 2. Build and deploy
mise exec -- pnpm graph codegen && mise exec -- pnpm graph build
mise exec -- pnpm run deploy:goldsky

# 3. Point the latest tag at the new version (frontend reads this)
mise exec -- pnpm run tag:latest

# 4. Delete old versions if you hit the free tier limit (max 3)
mise exec -- goldsky subgraph list
mise exec -- goldsky subgraph delete neuro-bounty-board/<old-version> --force
```

### Infrastructure
- TLSNotary Verifier Server: `https://notary.reyvon.gay` (Hetzner, 88.99.168.111)
  - Health: `https://notary.reyvon.gay/health`
  - WebSocket proxy: `wss://notary.reyvon.gay/proxy?token=<host>`
  - Attestation polling: `https://notary.reyvon.gay/attestation/:correlationId`
  - Caddy reverse proxy with auto-SSL, systemd service `tlsn-verifier`

### Deploying the Verifier Server
Source: `../TLSNotary-test/packages/verifier/` (Rust). Server: `root@88.99.168.111`.

```bash
# 1. Build release binary locally
cd ../TLSNotary-test/packages/verifier
cargo build --release

# 2. Upload binary
scp target/release/tlsn-verifier-server root@88.99.168.111:/usr/local/bin/tlsn-verifier-server.new

# 3. Swap binary and restart
ssh root@88.99.168.111 "mv /usr/local/bin/tlsn-verifier-server.new /usr/local/bin/tlsn-verifier-server && chmod +x /usr/local/bin/tlsn-verifier-server && systemctl restart tlsn-verifier"

# 4. Verify
curl https://notary.reyvon.gay/health
```

Server layout:
- Binary: `/usr/local/bin/tlsn-verifier-server`
- Config: `/etc/tlsn-verifier/config.yaml` (webhook endpoints)
- Env: `/etc/tlsn-verifier/notary.env` (NOTARY_PRIVATE_KEY)
- Service: `systemctl {start,stop,restart,status} tlsn-verifier`
- Logs: `journalctl -u tlsn-verifier -f`
- Reverse proxy: Caddy (auto-SSL for notary.reyvon.gay)

### Next Up
- Relayer for anonymous voting (currently `msg.sender` leaks voter identity despite Semaphore ZK proofs)
- Frontend reactivity fixes (action panel doesn't update after tx confirms, requires refresh)
- EURC approval UX improvements (max approval, spinner, refresh after approve)
- Batch frontend polish (see memory for full TODO list)

## Conventions

- Conventional commits (`feat:`, `fix:`, `chore:`, etc.). No Co-Authored-By lines.
- Commit per feature, only after manual testing by Arthur.
- Crypto should be invisible in the UI — no wallet jargon, no token names, just euros and buttons.
