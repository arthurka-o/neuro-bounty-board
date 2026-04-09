# ZK Bounty Board — Architectural Decisions (TLSNotary Integration)

Supersedes the Identity Layer and Voting sections of the original SPEC.md. These decisions were made after evaluating Reclaim Protocol (too expensive), TLSNotary (raw, no on-chain verification), vlayer (wraps TLSNotary with ZK but vendor dependency), and Primus Labs (TEE-based, weaker trust model).

---

## Decision 1: TLSNotary replaces Reclaim Protocol

**Why:** Reclaim's pricing is prohibitive. TLSNotary is a public good — no token, no fees, maintained by PSE (Ethereum Foundation). The MPC-TLS approach provides the strongest privacy guarantees (Notary never sees plaintext), and we're willing to invest engineering time to learn the protocol deeply.

**Trade-off accepted:** TLSNotary does not have production-ready on-chain verification. We build it ourselves (see Decision 3). The protocol only supports TLS 1.2 — this works today for Twitch and Discord but is a long-term risk if those platforms drop 1.2 support.

**What changes from original spec:**

- Remove Reclaim Protocol SDK dependency
- Remove `VoterRegistry.validateReclaimProof()` — replaced with Notary signature verification
- Users need the TLSNotary browser extension (Chrome) to generate proofs
- We host a WebSocket proxy for browser-to-TCP bridging (dumb pipe, no data access)

---

## Decision 2: Per-dispute Semaphore groups (replaces permanent voter registry)

**Problem solved:** Twitch subscriptions expire monthly. A permanent Semaphore group of "verified subscribers" accumulates stale members who may no longer be subscribed. Removing members from a Semaphore group is disruptive (changes the Merkle root, can invalidate in-progress proofs).

**Design:** Instead of one permanent voter group, create a fresh Semaphore group for each dispute. Voters must present a fresh TLSNotary proof of current subscription to join the dispute's group and vote. The proof timestamp must fall within the dispute's voting window.

**Flow:**

1. Sponsor rejects deliverable → `DisputeResolver.openDispute(bountyId)` creates a new Semaphore group
2. Voter generates a fresh TLSNotary attestation proving current Twitch subscription (via browser extension)
3. Voter calls `DisputeResolver.joinAndVote(bountyId, tlsnPresentation, semaphoreIdentity, semaphoreProof, vote)`
4. Contract verifies TLSNotary attestation (see Decision 3), adds voter to the dispute's Semaphore group, records the anonymous vote
5. Voting window closes → `resolveDispute()` tallies and executes

**Why this works:**

- Fresh proof = guaranteed current subscription at vote time
- No expiry management, no stale voters
- Per-dispute groups are cheap — disputes are expected to be rare (happy path has no dispute)
- Clean Semaphore integration — no need to remove members from groups
- Voters can still use different Semaphore identity commitments per dispute for unlinkable voting across disputes

**What changes from original spec:**

- Remove permanent "verified Neuro-sama subscribers" Semaphore group
- Remove separate `VoterRegistry.registerVoter()` step — registration and voting happen together
- `DisputeResolver.openDispute()` now also creates a Semaphore group
- `DisputeResolver.castVote()` becomes `DisputeResolver.joinAndVote()` — accepts TLSNotary proof + Semaphore proof in one transaction

**Sybil resistance:** Each TLSNotary proof reveals the Twitch user ID (hashed). The contract enforces one vote per Twitch account per dispute via `mapping(uint256 bountyId => mapping(bytes32 twitchIdHash => bool)) public hasVoted`. This check happens before the anonymous Semaphore vote, so the Twitch ID is linked to "voted in this dispute" but NOT to the vote direction (approve/reject).

---

## Decision 3: On-chain Notary signature verification

**What the contract verifies:**

1. **Notary signature** — the attestation was signed by a Notary whose public key is registered in the contract
2. **Commitment matching** — revealed transcript chunks hash (with their salts) to the commitments in the signed attestation
3. **Domain check** — the server identity in the attestation is `api.twitch.tv` (or the relevant Twitch domain)
4. **Data extraction** — the revealed response body contains the expected subscription data
5. **Freshness** — the attestation timestamp is within the dispute's voting window
6. **Uniqueness** — the Twitch user ID hash hasn't already voted in this dispute

**Signature scheme:** TBD based on what the Notary server actually produces. Two options:

- **secp256k1** (Ethereum-native) → use Solidity's built-in `ecrecover`. Cheapest (~3,000 gas). Preferred if we can configure the Notary to use this curve.
- **P256/secp256r1** → use RIP-7212 precompile, available on Base (where our contracts are deployed). ~100,000 gas. Viable fallback.

**Attestation format:** The exact byte layout of TLSNotary attestations is determined by the `tlsn` Rust crate's serialization. This needs to be reverse-engineered from actual attestation output and mirrored in Solidity. This is the highest-risk implementation task — the format is not yet stabilized and may change between alpha versions.

**HTTP parsing shortcut:** Rather than parsing JSON in Solidity (expensive and complex), the Prover submits the extracted Twitch username and subscription status as separate calldata arguments. The contract then verifies these strings appear within the revealed transcript chunk via a byte-contains check. Not full JSON parsing, but sufficient and gas-efficient.

**Contract interface sketch:**

```solidity
struct TLSNPresentation {
    bytes   signature;          // Notary's signature over attestationHash
    bytes32 attestationHash;    // hash of (domain, commitments, timestamp)
    string  serverDomain;       // "api.twitch.tv"
    uint256 timestamp;          // when the TLS session occurred
    bytes32[] commitments;      // hash commitments to transcript chunks
    bytes[] revealedChunks;     // plaintext of revealed chunks
    bytes32[] salts;            // salt for each revealed chunk
    uint256[] chunkIndices;     // which commitment each chunk maps to
}

function joinAndVote(
    uint256 bountyId,
    TLSNPresentation calldata proof,
    string calldata twitchUsername,
    bytes32 twitchIdHash,
    uint256 identityCommitment,
    uint256[8] calldata semaphoreProof,
    bool approve
) external {
    // 1. Check dispute is open and within voting window
    // 2. Check proof.timestamp >= dispute.openedAt
    // 3. Verify Notary signature (ecrecover or P256)
    // 4. Verify revealed chunks match commitments
    // 5. Verify domain is api.twitch.tv
    // 6. Verify twitchUsername appears in revealed chunk
    // 7. Check twitchIdHash not already voted in this dispute
    // 8. Add identityCommitment to dispute's Semaphore group
    // 9. Verify and record Semaphore vote
}
```

**Open question:** Can steps 8 and 9 (join group + vote) happen in the same transaction? The Semaphore proof requires the voter to already be in the group's Merkle tree. If adding a member changes the root, the proof generated before submission would be against a stale root. This may need to be split into two transactions: `joinDisputeGroup()` then `castVote()`. This needs testing with Semaphore's contract.

---

## Decision 4: M-of-N Notary network with community figures

**Problem:** Running a single Notary means users trust a single operator not to forge attestations. Even with on-chain signature verification, the operator controls the signing key and could produce fake proofs.

**Design:** Require attestations from M-of-N independent Notary operators. The smart contract stores a set of approved Notary public keys and requires at least M valid signatures on an attestation before accepting it.

**Notary operators:** Recruited from trusted, independent community figures. Ideal candidates:

- Established VTuber community moderators or content creators
- Developers of other Neuro-sama ecosystem tools
- Members of other Web3 community projects with reputational stake

**Requirements for Notary operators:**

- Run the TLSNotary Notary server (Rust binary, modest hardware requirements)
- Maintain uptime during dispute voting windows (14 days)
- Publish their Notary public key
- Agree to not collude with Provers

**Contract-side:**

```solidity
mapping(address => bool) public approvedNotaries;
uint256 public requiredSignatures; // M value

function verifyMultiNotary(
    TLSNPresentation[] calldata proofs
) internal view {
    uint256 validSigs = 0;
    address[] memory seen = new address[](proofs.length);

    for (uint i = 0; i < proofs.length; i++) {
        address signer = recoverNotarySigner(proofs[i]);
        require(approvedNotaries[signer], "unknown notary");

        // Prevent same notary signing twice
        for (uint j = 0; j < i; j++) {
            require(seen[j] != signer, "duplicate notary");
        }
        seen[i] = signer;
        validSigs++;
    }

    require(validSigs >= requiredSignatures, "not enough notary signatures");
}
```

**User-side flow:** The browser extension (or a wrapper) runs the MPC-TLS session with each Notary sequentially, collecting M attestations. This multiplies the proof generation time by M (each MPC-TLS session takes ~10-15 seconds in browser), but this only happens when voting on a dispute — not a frequent action.

**Initial config:** Start with 2-of-3. Three community Notaries, require two matching attestations. This is a meaningful improvement over single-notary trust while remaining operationally feasible.

**Upgrade path:** Eventually replace M-of-N Notary trust with ZK compression (Approach C from our evaluation). When TLSNotary or a wrapper like vlayer supports ZK proof generation that can be verified on-chain, the Notary trust assumption is eliminated entirely. The contract interface stays the same — swap `verifyMultiNotary()` for `verifyZKProof()`.

---

## Decision 5: Infrastructure we host

| Component                  | What it does                                                                    | Trust level                                                              |
| -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **WebSocket proxy**        | Bridges browser WebSocket to TCP for TLS connections. Forwards encrypted bytes. | Zero trust needed — it's a dumb pipe forwarding ciphertext it can't read |
| **Notary server** (1 of N) | MPC counterpart, signs attestations                                             | Trusted — but mitigated by M-of-N with independent operators             |
| **Frontend**               | Next.js app, triggers extension flow, submits proofs to contract                | No trust needed — all verification is on-chain                           |

We do NOT host:

- The Prover — runs in the user's browser via TLSNotary extension
- The verifier — verification happens on-chain in Solidity
- A backend API for proof relay — users submit directly to the smart contract

---

## Decision 6: User flow (end to end)

### Happy path (no dispute)

No TLSNotary involvement. Sponsor posts bounty → dev delivers → sponsor approves → escrow releases. Identity verification is only needed for dispute voting.

### Dispute voting flow

1. Sponsor rejects deliverable → dispute opens on-chain, fresh Semaphore group created
2. Voter visits the bounty board frontend
3. Frontend prompts voter to install TLSNotary browser extension (if not installed)
4. Voter clicks "Prove Twitch subscription & vote"
5. Extension opens Twitch, captures subscription API response
6. Extension runs MPC-TLS with N Notary servers (sequentially), collects M attestations
7. Voter selects their vote (approve/reject)
8. Frontend constructs transaction with attestations + Semaphore proof
9. Voter signs and submits transaction to `DisputeResolver.joinAndVote()`
10. Contract verifies M-of-N Notary signatures, checks subscription data, adds to Semaphore group, records anonymous vote
11. After voting window closes, anyone calls `resolveDispute()` to tally and execute

### UX considerations

- Steps 5-8 are the heaviest part (~30-60 seconds for M Notary sessions + proof generation). Show clear progress indicators.
- The extension install is a one-time friction point. Consider a "check eligibility" flow that lets users verify their setup before a real dispute happens.
- Semaphore identity management: the frontend should help users generate and store their Semaphore identity (or derive it deterministically from their wallet signature).

---

## Answered questions

2. **Signature curve — ANSWERED:** TLSNotary supports **both secp256k1 and P-256** (confirmed via `k256` and `p256` crates in `tlsn-attestation` dependencies). The choice is a configuration option. **Use secp256k1** for cheapest on-chain verification via native `ecrecover` (~3,000 gas). P-256 would require RIP-7212 precompile (~100k-300k gas). ed25519 is not used by TLSNotary at all.

4. **Twitch API endpoint — ANSWERED:** Use `POST https://gql.twitch.tv/gql` with a **custom raw GraphQL query** (no persisted query hash needed). The query `query { user(login: "CHANNEL") { displayName self { subscriptionBenefit { tier purchasedWithPrime } } } }` returns ~200 bytes. `subscriptionBenefit` is `null` when not subscribed, or `{tier: "1000", purchasedWithPrime: false}` when subbed. Domain check in contract should be `gql.twitch.tv`. Auth headers needed: `Authorization: OAuth <token>` and `Client-ID` (intercepted automatically by the TLSNotary browser extension plugin).

## Open questions

1. **TLSNotary attestation serialization format** — exact byte layout needs reverse-engineering from actual output. Highest-risk task for on-chain verification.
3. **Semaphore join + vote atomicity** — can adding a member to a Semaphore group and verifying a proof against that group happen in one transaction? Needs testing.
5. **Notary operator recruitment** — who are the initial 3 community Notary operators? This is a social/community challenge, not a technical one.
6. **TLS 1.2 risk** — if Twitch drops TLS 1.2, the entire identity layer breaks. Monitor Twitch's TLS configuration. Fallback: switch to vlayer or wait for TLSNotary TLS 1.3 support.
7. **Gas costs** — need to estimate total gas for `joinAndVote()`: M signature verifications + commitment hash checks + Semaphore group add + Semaphore proof verification. Base L2 gas is cheap but this is a complex transaction.

---

## Summary: trust model

| Layer                 | Trust assumption                                         | Mitigation                                                     |
| --------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| TLS data authenticity | Twitch's server is honest (standard web trust)           | N/A — same as any web app                                      |
| MPC-TLS correctness   | TLSNotary protocol is sound                              | Open source, audited cryptography, Ethereum Foundation project |
| Notary honesty        | Notary operators don't collude with Provers              | M-of-N independent operators; upgrade to ZK in future          |
| On-chain verification | Smart contract correctly verifies attestation signatures | Open source, auditable, testable                               |
| Vote anonymity        | Semaphore protocol is sound                              | Battle-tested (Worldcoin), Ethereum Foundation project         |
| Sybil resistance      | One Twitch account = one vote per dispute                | Twitch ID hash checked on-chain before anonymous vote          |
