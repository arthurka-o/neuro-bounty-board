# Neuro Bounty Board — Architecture & Implementation Spec

## What This Is

A trustless, community-funded bounty board for VTuber communities (initial target: Neuro-sama ecosystem). Viewers post bounties for game integrations/tools, devs claim and deliver, and disputes are resolved by anonymous community vote — not by trusting either party.

**Financial rail:** Smart contracts on Base mainnet (escrow, payout, dispute resolution). All bounties denominated in EURC stablecoin.
**Identity rail:** TLSNotary MPC-TLS proofs verify Twitch subscription status on-chain without doxxing users. M-of-N independent Notary servers prevent single-party trust.
**Voting rail:** Semaphore protocol for anonymous, sybil-resistant community voting via per-dispute groups.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Sponsor** | The person who posts and funds a bounty |
| **Dev** | The developer who claims and delivers the work |
| **Bond** | A stake the dev locks when claiming a bounty (griefing protection) |
| **Treasury** | Protocol-owned address that collects slashed bonds |
| **Notary** | An independent server operator running the TLSNotary verifier (MPC counterpart) |
| **Channel** | The Twitch channel voters must be subscribed to (e.g., vedal987) |

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
9. **Per-dispute Semaphore group is created** — a fresh voter group for this specific dispute.
10. **Voters prove subscription** — voters use the TLSNotary browser extension to generate a cryptographic proof of their current Twitch subscription to vedal987. The proof is verified by M-of-N independent Notary servers.
11. **Voters join dispute group** — the `joinDisputeGroup()` transaction verifies the TLSNotary attestations on-chain, checks sybil resistance (one vote per Twitch account), and adds the voter to the dispute's Semaphore group.
12. **Voters cast anonymous vote** — the `castVote()` transaction submits a Semaphore zero-knowledge proof. The vote (approve/reject) is recorded anonymously — no one can link a vote to a Twitch account.
13. **Resolution** — if community supermajority (>66%) says work is acceptable, escrow releases funds to dev + returns bond. If community sides with sponsor, funds return to sponsor and dev's bond is slashed to treasury.

### Timeout Path

14. **Dev misses deadline** — if the implementation deadline passes with no submission, sponsor can reclaim the full bounty amount. Dev's bond is slashed to treasury.

### Cancellation

15. **Before a dev is approved** — sponsor can cancel the bounty at any time and receive a full refund.
16. **After a dev is approved** — sponsor cannot cancel. They must wait for the dev to submit or for the deadline to expire.

### Concrete Example

> **Bounty:** "Osu! beatmap request system via channel points — 2,000 EURC"
>
> - `alice.eth` posts bounty, locks 2,000 EURC in escrow, sets a 30-day implementation deadline
> - `dev_shinji.eth` applies to the bounty
> - Alice reviews dev_shinji's profile, approves them. dev_shinji stakes 100 EURC bond (5%). 30-day clock starts.
> - After 2 weeks, dev submits: links GitHub repo + demo video
> - Alice rejects: "latency is too high, unusable."
> - Dispute opens. 14-day voting window. Fresh Semaphore group created.
> - 173 verified vedal987 subscribers generate TLSNotary proofs, join the dispute group, and cast anonymous votes: 142 approve, 31 reject (82% approval — supermajority reached, quorum met)
> - Escrow releases 2,000 EURC to dev_shinji, returns 100 EURC bond
> - Alice's rejection is overridden. On-chain record shows community consensus.

---

## Architecture Stack

```
+--------------------------------------------------+
|                    FRONTEND                       |
|  Next.js / React app                             |
|  - Browse/post/accept bounties                   |
|  - Trigger TLSNotary extension proof flow        |
|  - Generate Semaphore proofs for voting          |
|  - Connect wallet (wagmi/viem/RainbowKit)        |
+------------------------+-------------------------+
                         |
+------------------------v-------------------------+
|           IDENTITY LAYER (TLSNotary MPC-TLS)     |
|                                                  |
|  Browser Extension (Prover)                      |
|  - Runs TLSNotary plugin for Twitch GQL API      |
|  - MPC-TLS session with Notary server            |
|  - Reveals: response body (sub status, user ID)  |
|  - Hides: auth headers (OAuth token, Client-ID)  |
|                                                  |
|  Notary Servers (M-of-N, independently operated) |
|  - MPC counterpart, signs attestations           |
|  - secp256k1 signatures for cheap on-chain       |
|    verification via ecrecover (~3k gas)           |
|  - Includes WebSocket proxy for TLS bridging     |
+------------------------+-------------------------+
                         |
+------------------------v-------------------------+
|            ANONYMOUS VOTING LAYER                |
|                                                  |
|  Semaphore Protocol                              |
|  - Per-dispute groups (fresh proof per vote)     |
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
|  - createBounty / cancelBounty                   |
|  - approveDev / stakeBond                        |
|  - submitDeliverable                             |
|  - approveDeliverable / rejectDeliverable        |
|  - claimOnTimeout                                |
|                                                  |
|  DisputeResolver.sol                             |
|  - openDispute() — creates per-dispute group     |
|  - joinDisputeGroup() — verifies M-of-N TLSNotary|
|    proofs, sybil check, adds to Semaphore group  |
|  - castVote() — anonymous Semaphore vote         |
|  - resolveDispute() — tally + execute            |
|  - resolveEscalated() — admin resolution         |
|                                                  |
|  TLSNVerifier.sol (library)                      |
|  - recoverSigner (EIP-191 ecrecover)             |
|  - verifyAttestationHash                         |
|  - verifyChunkCommitments                        |
|  - verifyDomain                                  |
|  - containsBytes / extractJsonStringValue        |
+--------------------------------------------------+
```

---

## Component 1: Identity Verification (TLSNotary)

### What It Does

TLSNotary uses Multi-Party Computation TLS (MPC-TLS) to let a user prove facts from any HTTPS website without revealing credentials. The user's browser (Prover) and an independent Notary server jointly participate in the TLS handshake. The Notary never sees the plaintext data — it only validates that the data came from a genuine TLS connection to the claimed server. The Prover can then selectively reveal parts of the transcript while keeping sensitive data (auth tokens, cookies) hidden.

### Twitch Subscription Verification

**Plugin:** `twitch_sub.plugin.ts` — runs in the TLSNotary browser extension.

**Target:** `POST https://gql.twitch.tv/gql` with a custom raw GraphQL query:

```graphql
query {
  currentUser { id }
  user(login: "vedal987") {
    displayName
    self {
      subscriptionBenefit { tier purchasedWithPrime }
    }
  }
}
```

**Response (~200 bytes):**

```json
{
  "data": {
    "currentUser": { "id": "156846120" },
    "user": {
      "displayName": "vedal987",
      "self": {
        "subscriptionBenefit": {
          "tier": "1000",
          "purchasedWithPrime": false
        }
      }
    }
  }
}
```

- `currentUser.id` — the voter's Twitch user ID (used for sybil resistance)
- `displayName` — the channel name being subscribed to (verified on-chain)
- `subscriptionBenefit` — `null` when not subscribed; `{tier: "1000"/"2000"/"3000"}` when subbed
- `purchasedWithPrime` — whether the sub is via Amazon Prime

**What's revealed vs hidden:**

| Data | Status |
|------|--------|
| Request start line (`POST /gql`) | Revealed |
| Request body (GQL query) | Revealed |
| Response status (`200 OK`) | Revealed |
| Response body (sub data) | Revealed |
| `Authorization: OAuth <token>` | Committed (hash verified, plaintext hidden) |
| `Client-ID` | Committed (hash verified, plaintext hidden) |

### M-of-N Notary Network

A single Notary means trusting one operator. We require **M-of-N independent Notary signatures** (initially 2-of-3).

The browser extension runs the MPC-TLS session with each Notary sequentially, collecting M attestations. Each attestation is independently signed with the Notary's secp256k1 key. The smart contract verifies all M signatures on-chain via `ecrecover` (~3k gas each).

**Notary operators:** Recruited from trusted, independent community figures (moderators, ecosystem tool developers, community leaders).

**Requirements for operators:**
- Run the TLSNotary verifier server (Rust binary) with WebSocket proxy enabled
- Maintain uptime during dispute voting windows (14 days)
- Publish their Notary public key (registered on-chain by admin)

### Sybil Resistance

Each TLSNotary proof contains the voter's `currentUser.id` (Twitch user ID). The contract extracts this from the revealed response body on-chain via `extractJsonStringValue(chunk, "id")` and derives a sybil key: `keccak256(twitchUserId)`. This key is checked per-dispute — one Twitch account can only join each dispute's voter group once.

The sybil key is derived from the proof itself, not from caller-supplied parameters, making it impossible to bypass.

### Subscription Check

The contract checks for the byte pattern `"subscriptionBenefit":{"tier":"` in the revealed chunks. This pattern is:
- Present for any active subscription (Tier 1/2/3, Prime or paid)
- Absent when `subscriptionBenefit` is `null` (not subscribed)

The specific pattern `"subscriptionBenefit":{"tier":"` is used instead of just `"tier":"` to prevent false positives from other JSON contexts.

### Channel Verification

The contract checks for the exact pattern `"displayName":"vedal987"` in the revealed chunks to ensure the proof is for the correct channel. The `channelName` parameter is passed by the caller and verified against the proof content.

---

## Component 2: Anonymous Voting (Semaphore)

### Per-Dispute Groups

Instead of a permanent voter group, a **fresh Semaphore group** is created for each dispute. This solves the stale-member problem: Twitch subscriptions expire monthly, and a permanent group would accumulate members who are no longer subscribed.

**Two-transaction voting flow:**

1. **`joinDisputeGroup(bountyId, proofs, channelName, identityCommitment)`**
   - Verifies M-of-N TLSNotary attestations
   - Extracts Twitch user ID from proof for sybil check
   - Checks subscription status
   - Adds voter's Semaphore identity commitment to the dispute's group

2. **`castVote(bountyId, semaphoreProof)`**
   - Verifies Semaphore zero-knowledge proof against the dispute's group
   - Records anonymous vote (approve=1, reject=0)
   - Nullifier prevents double-voting

**Why two transactions:** Adding a member to a Semaphore group changes the Merkle root. A Semaphore proof generated before the member is added would be against a stale root. The two-tx flow ensures the voter is in the group before generating their vote proof.

### Voting Mechanics

- **Voting period:** 14 days (configurable by admin)
- **Quorum:** 10 minimum votes. If not met, the period extends once (same duration). If still not met after extension, escalated to admin.
- **Supermajority:** >66.67% of votes must agree. If neither side reaches supermajority, escalated to admin.
- **Escalation:** Admin calls `resolveEscalated(bountyId, outcome)`. Funds remain in escrow until resolved.

---

## Component 3: Escrow & Bounty Lifecycle

### Bounty States

```
Open -> Applied -> Active -> Submitted -> Approved
  |                  |          |
  |                  |          +-> Disputed -> Resolved
  |                  |                           |
  |                  |                           +-> Escalated -> Resolved
  |                  |
  |                  +-> Expired (dev missed deadline)
  |
  +-> Cancelled (sponsor cancelled before dev approved)
```

### Categories

- **Game Integration** — mods, overlays, game-specific tools
- **Art** — emotes, assets, visual content
- **Tool** — bots, utilities, browser extensions
- **Other** — anything that doesn't fit above

### Bond Mechanics

- **Bond amount:** 5% of bounty reward (configurable by admin)
- **On success:** Returned to dev
- **On dev timeout:** Slashed to treasury
- **On dispute loss:** Slashed to treasury

### Currency

All bounties denominated in **EURC** (Circle's Euro stablecoin). Displayed as euros in the UI — crypto is invisible to end users. Minimum reward: 1 EURC.

---

## Smart Contracts

### BountyEscrow.sol (UUPS Upgradeable)

Manages the full bounty lifecycle: creation, dev approval, bond staking, submission, review, payout, and timeout claims. Calls `DisputeResolver.openDispute()` when a sponsor rejects a deliverable.

### DisputeResolver.sol (UUPS Upgradeable)

Manages dispute voting with TLSNotary verification and Semaphore anonymous voting.

**State:**
- `approvedNotaries` — mapping of registered Notary signer addresses
- `requiredSignatures` — M value for M-of-N verification (initially 2)
- `expectedDomain` — TLS server domain to verify (`"gql.twitch.tv"`)
- `disputeGroupIds` — per-dispute Semaphore group IDs
- `hasJoinedDispute` — tracks which Twitch accounts have joined each dispute

**Key functions:**
- `openDispute(bountyId)` — creates per-dispute Semaphore group (called by BountyEscrow)
- `joinDisputeGroup(bountyId, proofs, channelName, identityCommitment)` — verifies M-of-N TLSNotary proofs, sybil check, subscription check, channel verification, adds to Semaphore group
- `castVote(bountyId, semaphoreProof)` — anonymous vote via Semaphore
- `resolveDispute(bountyId)` — tallies votes, handles quorum/supermajority/extension/escalation
- `resolveEscalated(bountyId, outcome)` — admin resolution for escalated disputes

### TLSNVerifier.sol (Library)

Pure functions for TLSNotary proof verification:
- `recoverSigner()` — EIP-191 signature recovery via `ecrecover`
- `verifyAttestationHash()` — recomputes and validates `keccak256(domain, commitments, timestamp)`
- `verifyChunkCommitments()` — verifies `keccak256(chunk || salt) == commitment`
- `verifyDomain()` — checks server domain matches expected
- `containsBytes()` — substring search in byte arrays
- `extractJsonStringValue()` — extracts a JSON string value by key from byte data

---

## Infrastructure & Deployment

### What We Host

| Component | Purpose | Trust Level |
|-----------|---------|-------------|
| **TLSNotary Verifier Server** | MPC-TLS counterpart, signs attestations with secp256k1 key | Trusted — mitigated by M-of-N with independent operators |
| **WebSocket Proxy** (built into verifier) | Bridges browser WebSocket to TCP for TLS connections | Zero trust — forwards encrypted bytes it can't read |
| **Frontend** (Next.js) | UI for browsing bounties, triggering proofs, submitting votes | No trust needed — all verification is on-chain |
| **Subgraph** (The Graph) | Indexes on-chain events for fast frontend queries | No trust needed — derived from on-chain data |

### TLSNotary Verifier Server

Each Notary operator runs an instance of the TLSNotary verifier server. This is a Rust binary that:

1. **Participates in MPC-TLS** — co-signs the TLS handshake without seeing plaintext
2. **Validates transcript integrity** — ensures the HTTP request/response hasn't been tampered with
3. **Generates attestations** — signs proof data with secp256k1 key
4. **Runs WebSocket proxy** — bridges browser WebSocket to target TCP servers (e.g., `gql.twitch.tv:443`)

**Endpoints:**

| Endpoint | Protocol | Purpose |
|----------|----------|---------|
| `/health` | HTTP GET | Health check |
| `/session` | WebSocket | Create MPC-TLS session |
| `/verifier?sessionId=<id>` | WebSocket | Run verification protocol |
| `/proxy?token=<host>` | WebSocket | WebSocket-to-TCP proxy |

**Deployment:**

```bash
cd packages/verifier
cargo run                           # Development
cargo build --release               # Production binary
./target/release/tlsn-verifier-server
```

Listens on `http://0.0.0.0:7047` by default. For production, put behind nginx with SSL termination and long WebSocket timeouts (MPC-TLS operations take ~10-15 seconds).

**Configuration** (`config.yaml`):
- Webhook endpoints (optional, for backend integration)
- No other config needed — the server auto-handles session management

### Deployed Contracts (Base Mainnet)

- BountyEscrow proxy: `0x1005c4231E5A687F41A15277cEc416d4A9D3649e`
- DisputeResolver proxy: `0xF7bBF83bdA864b7298eeBfB509c887033226FaB4`
- Semaphore (Base): `0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D`
- EURC (Base): `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42`

---

## File Structure

```
neuro-bounty-board/                    # pnpm monorepo root
├── CLAUDE.md
├── docs/
│   ├── SPEC.md                        # This file
│   └── tlsnotary-reference.md         # TLSNotary protocol reference
├── packages/
│   ├── contracts/                     # Foundry project
│   │   ├── src/
│   │   │   ├── BountyEscrow.sol
│   │   │   ├── DisputeResolver.sol
│   │   │   └── libraries/
│   │   │       └── TLSNVerifier.sol
│   │   ├── test/
│   │   │   ├── BountyEscrow.t.sol
│   │   │   ├── DisputeResolver.t.sol
│   │   │   └── TLSNVerifier.t.sol
│   │   ├── script/
│   │   │   ├── Deploy.s.sol
│   │   │   └── UpgradeDisputeResolver.s.sol
│   │   ├── lib/forge-std/             # git submodule
│   │   └── foundry.toml
│   └── frontend/                      # Next.js App Router
│       ├── public/
│       │   └── plugins/
│       │       └── twitch_sub.js      # Built TLSNotary plugin
│       └── src/
│           ├── app/
│           │   ├── page.tsx           # Bounty listing
│           │   ├── bounty/[id]/       # Bounty detail
│           │   └── create/            # Post new bounty
│           ├── components/
│           │   └── ActionPanel.tsx     # Includes VoteSection with TLSNotary flow
│           └── lib/
│               ├── types.ts           # Shared types & constants
│               ├── contracts.ts       # Contract ABIs & addresses
│               ├── hooks.ts           # Custom hooks (useDispute, etc.)
│               └── subgraph.ts        # Subgraph query functions
├── mise.toml
├── package.json
└── pnpm-workspace.yaml
```

---

## Implementation Status

### Done
- Monorepo scaffold (pnpm workspace, Foundry, Next.js)
- Wallet connection (wagmi + RainbowKit, Base chain)
- Frontend pages: bounty listing, detail, create — with category filters, stats, design system
- BountyEscrow.sol — full bounty lifecycle (UUPS upgradeable)
- DisputeResolver.sol — per-dispute Semaphore groups, TLSNotary M-of-N verification, two-tx voting flow
- TLSNVerifier.sol — on-chain TLSNotary proof verification library
- 139 tests passing (BountyEscrow, DisputeResolver, TLSNVerifier)
- Contracts deployed and verified on Base mainnet
- Subgraph for indexing on-chain events
- Frontend wired: reads from subgraph + chain, create form calls contract
- SQLite for off-chain metadata (title, description, category, applications)
- TLSNotary browser extension plugin (`twitch_sub.plugin.ts`) — proves Twitch subscription
- Frontend VoteSection — TLSNotary extension detection, proof generation, proof display
- Real TLSNotary proof captured and validated against contract tests

### Next Up
- Wire `joinDisputeGroup()` contract call from frontend (with TLSNotary proof data)
- Semaphore identity management in frontend (generate/store identity commitment)
- Semaphore proof generation for `castVote()` in frontend
- Deploy and register Notary server keys on-chain
- Recruit 2 additional independent Notary operators (for 2-of-3)
- EURC approval flow in frontend
- Wire remaining action buttons (approve dev, stake bond)

---

## Key Design Decisions

### Why TLSNotary over Reclaim Protocol?

| Factor | TLSNotary | Reclaim |
|--------|-----------|---------|
| Cost | Free (public good, no token/fees) | Prohibitive pricing |
| Trust model | MPC-TLS (Notary never sees plaintext) | Attestor network |
| Maintainer | PSE (Ethereum Foundation) | Reclaim Labs |
| On-chain verification | Built ourselves (TLSNVerifier.sol) | Built-in verifier contract |
| Browser requirement | TLSNotary extension (Chrome) | Reclaim SDK (lighter) |
| Flexibility | Any HTTPS site, custom plugins | Provider marketplace |

### Why Per-Dispute Semaphore Groups?

Twitch subscriptions expire monthly. A permanent group accumulates stale members. Per-dispute groups guarantee fresh proof of current subscription at vote time, with no expiry management needed.

### Why Two Transactions (Join + Vote)?

Adding a member to a Semaphore group changes the Merkle root. A Semaphore proof must be generated against the current root, which requires the voter to already be in the group. The two-tx flow (`joinDisputeGroup` then `castVote`) ensures consistency.

### Why Base Mainnet?

- Low gas costs (L2)
- EURC natively available
- Semaphore V4 deployed
- Good tooling support (Foundry, The Graph)

---

## Trust Model

| Layer | Trust Assumption | Mitigation |
|-------|-----------------|------------|
| TLS data authenticity | Twitch's server is honest | Standard web trust |
| MPC-TLS correctness | TLSNotary protocol is sound | Open source, Ethereum Foundation project |
| Notary honesty | Notary operators don't forge attestations | M-of-N independent operators |
| On-chain verification | Smart contract correctly verifies proofs | Open source, 139 tests, auditable |
| Vote anonymity | Semaphore protocol is sound | Battle-tested (Worldcoin), Ethereum Foundation |
| Sybil resistance | One Twitch account = one vote per dispute | Twitch user ID extracted from proof on-chain |
| Channel verification | Proof contains correct channel displayName | Exact pattern match on-chain |
| Subscription verification | Proof contains subscription tier data | Specific JSON pattern check on-chain |

---

## Open Questions

- **Notary operator recruitment** — who are the initial 3 independent Notary operators?
- **TLS 1.2 risk** — TLSNotary currently requires TLS 1.2. If Twitch drops 1.2 support, the identity layer breaks. Monitor Twitch's TLS config.
- **Quorum tuning** — starting at 10 minimum votes. May need adjusting based on actual voter turnout.
- **Voter incentives** — revisit after v1 launch based on participation rates.
- **Governance** — single admin for v1, potentially multisig/DAO later.
- **Notary signing format** — current `TLSNVerifier.Presentation` struct is designed for future notary-signed attestations. The exact serialization format from the TLSNotary verifier server needs to be finalized when notary signing is implemented.
