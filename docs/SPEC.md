# ZK Bounty Board — Architecture & Implementation Spec

## What This Is

A trustless, community-funded bounty board for VTuber communities (initial target: Neuro-sama ecosystem). Viewers post bounties for game integrations/tools, devs claim and deliver, and disputes are resolved by ZK-verified community vote — not by trusting either party.

**Financial rail:** Smart contracts on Ethereum mainnet (escrow, payout, dispute resolution). All bounties denominated in EURC stablecoin.
**Identity rail:** zkTLS proofs (Reclaim Protocol) bridge Twitch/Discord credentials on-chain without doxxing users.
**Voting rail:** Semaphore protocol for anonymous, sybil-resistant community voting.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Sponsor** | The person who posts and funds a bounty |
| **Dev** | The developer who claims and delivers the work |
| **Bond** | A stake the dev locks when claiming a bounty (griefing protection) |
| **Treasury** | Protocol-owned address that collects slashed bonds |

---

## Core User Flow

### Happy Path

1. **Sponsor posts bounty** — locks EURC into escrow smart contract. Describes the deliverable (e.g., "Minecraft death counter overlay for Neuro-sama"). Sets an implementation deadline.
2. **Devs apply to bounty** — one or more devs express interest off-chain (no stake required to apply). Sponsor reviews applicants.
3. **Sponsor approves a dev** — sponsor picks one applicant on-chain. The chosen dev then stakes a bond (percentage of bounty reward). Implementation deadline clock starts.
4. **Dev submits deliverable** — links to repo/demo, marks bounty as "submitted."
5. **Sponsor reviews** — has a limited review window (e.g., 14 days) to accept or reject.
6. **Sponsor approves** — escrow releases funds to dev + returns bond. Done.
7. **Sponsor doesn't respond** — if the review window expires without action, dev can redeem funds directly.

### Dispute Path

8. **Sponsor rejects** — claims work is incomplete/broken. Bounty enters dispute.
9. **Community vote opens** — only ZK-verified Twitch subscribers (or Discord role holders) can vote. Voters prove eligibility via Reclaim Protocol, then vote anonymously via Semaphore.
10. **Resolution** — if community supermajority (>66%) says work is acceptable, escrow releases funds to dev + returns bond. If community sides with sponsor, funds return to sponsor and dev's bond is slashed to treasury.

### Timeout Path

11. **Dev misses deadline** — if the implementation deadline passes with no submission, sponsor can reclaim the full bounty amount. Dev's bond is slashed to treasury.

### Cancellation

12. **Before a dev is approved** — sponsor can cancel the bounty at any time and receive a full refund.
13. **After a dev is approved** — sponsor cannot cancel. They must wait for the dev to submit or for the deadline to expire. (If the sponsor wants to "start over," they can wait for timeout, then create a new bounty.)

### Concrete Example

> **Bounty:** "Osu! beatmap request system via channel points — 2,000 EURC"
>
> - `alice.eth` posts bounty, locks 2,000 EURC in escrow, sets a 30-day implementation deadline
> - `dev_shinji.eth` applies to the bounty
> - Alice reviews dev_shinji's profile, approves them. dev_shinji stakes 100 EURC bond (5%). 30-day clock starts.
> - After 2 weeks, dev submits: links GitHub repo + demo video
> - Alice rejects: "latency is too high, unusable."
> - Dispute opens. 14-day voting window.
> - 173 verified Neuro-sama subscribers vote: 142 approve, 31 reject (82% approval — supermajority reached, quorum met)
> - Escrow releases 2,000 EURC to dev_shinji, returns 100 EURC bond
> - Alice's rejection is overridden. On-chain record shows community consensus.

---

## Architecture Stack

```
+--------------------------------------------------+
|                    FRONTEND                       |
|  Next.js / React app                             |
|  - Browse/post/accept bounties                   |
|  - Trigger Reclaim verification flow             |
|  - Generate Semaphore proofs for voting          |
|  - Connect wallet (wagmi/viem)                   |
+------------------------+-------------------------+
                         |
+------------------------v-------------------------+
|              IDENTITY LAYER (zkTLS)              |
|                                                  |
|  Reclaim Protocol                                |
|  - Proves Twitch subscription status             |
|  - Proves Discord role membership                |
|  - Proof generated client-side (zk-SNARK)        |
|  - Attestor network validates HTTPS response     |
|  - Output: on-chain proof -> adds user to        |
|    Semaphore group                               |
+------------------------+-------------------------+
                         |
+------------------------v-------------------------+
|            ANONYMOUS VOTING LAYER                |
|                                                  |
|  Semaphore Protocol                              |
|  - Group = "verified Neuro-sama subscribers"     |
|  - Members prove group membership via zk-SNARK   |
|  - Cast votes (approve/reject) anonymously       |
|  - Nullifiers prevent double-voting              |
|  - On-chain verification of proof validity       |
+------------------------+-------------------------+
                         |
+------------------------v-------------------------+
|             SMART CONTRACT LAYER                 |
|                                                  |
|  BountyEscrow.sol                                |
|  - createBounty(description, deadline, reward)   |
|  - applyToBounty(bountyId)                       |
|  - approveDev(bountyId, devAddress)              |
|  - submitDeliverable(bountyId, proofURI)         |
|  - approveDeliverable(bountyId) -> release funds |
|  - rejectDeliverable(bountyId) -> open dispute   |
|  - cancelBounty(bountyId)                        |
|  - claimOnTimeout(bountyId) -> sponsor/dev       |
|                                                  |
|  DisputeResolver.sol                             |
|  - openDispute(bountyId)                         |
|  - castVote(bountyId, semaphoreProof, vote)      |
|  - resolveDispute(bountyId) -> tally + execute   |
|                                                  |
|  VoterRegistry.sol                               |
|  - registerVoter(reclaimProof) -> add to         |
|    Semaphore group                               |
|  - Validates Reclaim proof on-chain              |
|  - Manages Semaphore group Merkle tree           |
+--------------------------------------------------+
```

---

## Component 1: Identity Verification (Reclaim Protocol)

### What It Does

Reclaim Protocol uses zkTLS to let a user prove facts from any HTTPS website without revealing credentials. The user logs into Twitch/Discord in their browser, Reclaim intercepts the HTTPS response through an attestor network, and generates a zk-SNARK proof that the response contained the expected data (e.g., "subscribed: true"). The proof is verifiable on-chain.

### Providers Needed

**Twitch Subscription Provider:**
- Target URL: Twitch's subscription check endpoint (`https://api.twitch.tv/helix/subscriptions/user`)
- Data to extract: `is_subscribed: true` for the Neuro-sama channel
- The provider is configured in Reclaim Dev Center by specifying URL, JSON path, and assertion

**Discord Role Provider:**
- Target URL: Discord's guild member endpoint (user's role list for a specific server)
- Data to extract: user has the verified-subscriber role in the Neuro-sama Discord server

### Flow

1. User clicks "Verify" in the frontend
2. Reclaim SDK opens a flow where the user logs into Twitch/Discord
3. Reclaim's attestor network observes the HTTPS response and generates a zk-SNARK proof
4. Proof is submitted to `VoterRegistry` contract on-chain
5. Contract verifies the proof and adds user's Semaphore identity commitment to the voter group

### Sybil Resistance

One person could have multiple subscribed Twitch accounts. To mitigate:
- Reclaim proofs should bind to a unique identifier (e.g., Twitch user ID) that is hashed and checked for uniqueness on-chain
- A single Twitch/Discord account can only be registered once, regardless of wallet address

---

## Component 2: Anonymous Voting (Semaphore)

### What It Does

Semaphore lets users prove they're members of a group and send signals (votes) without revealing which member they are. It uses zk-SNARKs with a Merkle tree of identity commitments. Each vote includes a nullifier that prevents double-voting for a specific dispute, but nullifiers from different disputes can't be linked — so voting patterns stay private.

### Voting Mechanics

- **Voting period:** Fixed duration, configurable by admin/council (e.g., 14 days initially).
- **Quorum:** Minimum 10 votes required for a dispute resolution to be valid. If quorum is not met by the end of the voting period, the period is extended once (same duration). If quorum is still not met after the extension, the dispute is escalated to the admin/council multisig for manual resolution.
- **Supermajority threshold:** >66% of votes must agree for a resolution. If neither side reaches 66%, the dispute is escalated to the admin/council multisig for manual resolution. Funds remain in escrow until the admin calls `resolveEscalated(bountyId, outcome)`.
- **Vote options:** Approve (dev's work is acceptable) or Reject (dev's work is not acceptable).

### Voter Incentive

**Status: Under consideration.**

A small reward for voters (e.g., a cut of the slashed bond in disputes) could increase participation. However, since voters are already paying for Twitch subscriptions, there's a concern that monetary incentives could encourage bad-faith voting for profit. Given the economics (Twitch sub cost vs. potential voting reward), it's unlikely to be profitable to game — but this needs more thought before committing.

For v1, voting is a community service with no direct financial reward.

---

## Component 3: Escrow & Bounty Lifecycle

### Bounty States

```
Open -> Applied -> Active -> Submitted -> Approved
  |                  |          |
  |                  |          +-> Disputed -> Resolved
  |                  |
  |                  +-> Expired (dev missed deadline)
  |
  +-> Cancelled (sponsor cancelled before dev approved)
```

### Categories

Bounties are tagged with a category for filtering. Initial set for v1:
- **Game Integration** — mods, overlays, game-specific tools
- **Art** — emotes, assets, visual content
- **Tool** — bots, utilities, browser extensions
- **Other** — anything that doesn't fit above

Categories are stored on-chain as part of the bounty (simple enum). The list is extensible by admin.

### Application Model

Dev applications are **off-chain only** — no bond is required to apply. Multiple devs can apply to the same bounty. The sponsor reviews applicants (via the frontend) and selects one. The on-chain transaction is `approveDev(bountyId, devAddress)`, at which point the chosen dev must stake their bond to confirm. If the dev doesn't stake within a reasonable window (e.g., 3 days), the sponsor can pick a different applicant.

### Currency

All bounties are denominated in **EURC** (Circle's Euro stablecoin, ERC-20 on Ethereum mainnet). The contract interacts with EURC via standard ERC-20 `transferFrom`/`transfer`. Sponsors must approve the escrow contract to spend their EURC before creating a bounty. Minimum reward is 1 EURC (1e6 base units) to prevent spam.

### Bond Mechanics

- **Bond amount:** Fixed percentage of bounty reward (e.g., 5%). Configurable by admin/council.
- **Bond on success:** Returned to dev when deliverable is approved (by sponsor or by community vote).
- **Bond on dev timeout:** Slashed to treasury.
- **Bond on dispute loss (community sides with sponsor):** Slashed to treasury.

### Review Window

- After a dev submits a deliverable, the sponsor has a limited window to accept or reject (e.g., 14 days, configurable by admin/council).
- If the sponsor does not respond within the review window, the dev can call a function to redeem the bounty funds + their bond directly. No dispute needed.

### Treasury

- Receives: slashed bonds.
- Controlled by: admin/council multisig (initially), potentially DAO governance later.
- Purpose: fund protocol maintenance, community initiatives, or voter rewards if implemented.

---

## Key Design Decisions

### Why Reclaim over zkPass?

| Factor | Reclaim | zkPass |
|--------|---------|--------|
| Provider flexibility | Any HTTPS site, custom providers via AI tool | Schema marketplace, more structured |
| DX complexity | Simple JS SDK, 3 lines to start | Requires TransGate extension + MPC node network |
| Proof generation | Client-side zk-SNARK | VOLE-based IZK, needs browser extension |
| Token dependency | Minimal — protocol fees only | $ZKP token required for settlement |
| Maturity | 3M+ verifications, live on mainnet | Live but more enterprise-focused |
| Open source | SDK is open source | TransGate JS-SDK is open source |

Reclaim is the better fit because we need custom providers for Twitch/Discord APIs, and the lighter SDK means less friction for community devs.

### Why Semaphore for voting?

- Purpose-built for exactly this: anonymous group membership proof + signaling
- Built-in double-vote prevention via nullifiers
- Public good (no token, no fees, maintained by Ethereum Foundation's PSE team)
- Battle-tested — Worldcoin's World ID uses it at scale
- Solidity contracts for on-chain verification are production-ready
- Works on any EVM chain

### Why Ethereum Mainnet?

- Post-Dencun gas costs are low enough for this use case
- Disputes (the expensive part with on-chain zk-SNARK verification per vote) should be rare — the happy path is cheap
- Maximum credibility and composability — no bridge risk, no L2 liveness assumptions
- EURC is natively available on Ethereum mainnet

### Why EURC?

- Stable denomination — bounty values don't fluctuate with crypto markets
- Euro-denominated — good fit for international community (Neuro-sama audience is global)
- Circle-issued, fully backed, widely available on exchanges
- Standard ERC-20 — simple contract integration

---

## File Structure

```
neuro-bounty-board/                  # pnpm monorepo root
├── CLAUDE.md
├── docs/
│   ├── SPEC.md                      # This file
│   └── reclaim-reference.md         # Reclaim Protocol integration reference
├── packages/
│   ├── contracts/                   # Foundry project
│   │   ├── src/
│   │   │   ├── BountyEscrow.sol
│   │   │   ├── DisputeResolver.sol
│   │   │   └── VoterRegistry.sol
│   │   ├── test/
│   │   ├── script/
│   │   ├── lib/forge-std/           # git submodule
│   │   └── foundry.toml
│   └── frontend/                    # Next.js App Router
│       └── src/
│           ├── app/
│           │   ├── page.tsx         # Bounty listing
│           │   ├── bounty/[id]/     # Bounty detail
│           │   └── create/          # Post new bounty
│           ├── components/          # UI components
│           └── lib/
│               ├── types.ts         # Shared types & constants
│               └── mock-data.ts     # Mock data (temporary)
├── mise.toml
├── package.json
└── pnpm-workspace.yaml
```

---

## Implementation Order

### Phase 0: Scaffold (DONE)
- pnpm monorepo with Foundry + Next.js packages
- Wallet connection (wagmi + RainbowKit)
- Frontend pages: bounty listing, detail, create (all with mock data)
- Design system: warm light theme, Plus Jakarta Sans + Be Vietnam Pro

### Phase 1: Core Contracts (CURRENT)
1. `BountyEscrow.sol` — create, cancel, approve dev, submit, approve/reject, timeout claims
2. Tests for escrow flow (happy path, cancellation, timeouts)
3. Wire frontend to contracts (replace mock data with contract reads/writes)
4. Deploy to Sepolia testnet with a mock ERC-20

### Phase 2: Identity Layer
5. Register Reclaim app + create Twitch sub provider
6. Create Discord role provider
7. `VoterRegistry.sol` — verify Reclaim proofs, manage Semaphore group, sybil checks
8. Frontend: verification flow with Reclaim JS SDK

### Phase 3: Voting & Disputes
9. `DisputeResolver.sol` — Semaphore-based anonymous voting, quorum, supermajority
10. Frontend: vote widget with client-side proof generation
11. Integration tests: full dispute flow end-to-end

### Phase 4: Polish
12. Real-time updates (events/subgraph)
13. IPFS for bounty descriptions and deliverable proofs

---

## Open Questions

- **Quorum tuning** — starting at 10 minimum votes. May need adjusting based on actual voter turnout post-launch.
- **Voter incentives** — revisit after v1 launch based on participation rates.
- **Governance** — single admin for v1, potentially multisig/DAO later.
- **Bounty tag list** — starting with a small set (game integrations, art, tools, etc.). Needs finalizing before frontend work.

---

## External Resources

### Reclaim Protocol
- Docs: https://docs.reclaimprotocol.org/
- JS SDK: https://www.npmjs.com/package/@reclaimprotocol/js-sdk
- Dev Center (register app, create providers): https://dev.reclaimprotocol.org/
- GitHub: https://github.com/reclaimprotocol

### Semaphore
- Docs: https://docs.semaphore.pse.dev/
- GitHub: https://github.com/semaphore-protocol/semaphore
- NPM: https://www.npmjs.com/package/@semaphore-protocol/core
- Contracts: https://www.npmjs.com/package/@semaphore-protocol/contracts

### Smart Contract Infra
- Foundry: https://book.getfoundry.sh/
- OpenZeppelin: https://docs.openzeppelin.com/contracts/

### Frontend
- wagmi (wallet connection): https://wagmi.sh/
- viem (Ethereum client): https://viem.sh/
- RainbowKit (connect button UI): https://www.rainbowkit.com/
