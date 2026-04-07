# Semaphore V4 — Integration Reference

Reference doc for Semaphore V4 usage in the Neuro Bounty Board. Covers identity, groups, proofs, on-chain integration, and deployed addresses. Source: https://docs.semaphore.pse.dev/

---

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Identity** | User's cryptographic keypair (private key, public key, commitment). The commitment is the public identifier added to groups. |
| **Group** | Merkle tree of identity commitments. Members can prove membership via zk-SNARK without revealing which leaf they are. |
| **Proof** | zk-SNARK proving: (1) membership in group, (2) authorship of message, (3) message integrity. |
| **Scope** | A topic/context string. Each identity can only produce one valid proof per scope (enforced by nullifier). |
| **Nullifier** | Derived from identity + scope. Prevents double-signaling. Cannot be linked across different scopes. |
| **Message** | Arbitrary uint256 signal attached to the proof (e.g., a vote: 1 = approve, 0 = reject). |

---

## Packages

```bash
# All-in-one (identity + group + proof)
npm install @semaphore-protocol/core

# Individual packages
npm install @semaphore-protocol/identity
npm install @semaphore-protocol/group
npm install @semaphore-protocol/proof

# Solidity contracts (for Foundry/Hardhat)
npm install @semaphore-protocol/contracts

# On-chain data fetching (subgraph)
npm install @semaphore-protocol/data
```

---

## JavaScript SDK

### Identity

```typescript
import { Identity } from "@semaphore-protocol/identity"

// Random identity
const identity = new Identity()

// Deterministic identity (from a secret — e.g., user's signature)
const identity = new Identity("secret-value")

// Key properties
identity.privateKey   // bigint
identity.publicKey    // bigint
identity.commitment   // bigint — this gets added to groups

// Sign & verify
const signature = identity.signMessage("hello")
const valid = Identity.verifySignature("hello", signature, identity.publicKey)

// Export/import (base64 private key)
const exported = identity.export()
const imported = Identity.import(exported)
```

### Group (off-chain)

```typescript
import { Group } from "@semaphore-protocol/group"

// Create empty group
const group = new Group()

// Create with initial members
const group = new Group([commitment1, commitment2, commitment3])

// Add members
group.addMember(identity.commitment)
group.addMembers([commitment1, commitment2])

// Remove member by index (sets leaf to 0, doesn't shrink tree)
group.removeMember(0)

// Update member
group.updateMember(0, newCommitment)

// Generate Merkle proof for member at index
const merkleProof = group.generateMerkleProof(0)

// Group properties
group.root      // current Merkle root
group.depth     // tree depth
group.size      // number of leaves (including zeroed-out removed members)
```

### Proof Generation & Verification

```typescript
import { generateProof, verifyProof } from "@semaphore-protocol/proof"

// Generate proof
// - identity: the user's Identity
// - group: Group containing the identity's commitment
// - message: uint256 signal (e.g., vote value)
// - scope: unique identifier for this voting context (prevents double-voting)
const proof = await generateProof(identity, group, message, scope)

// proof object contains:
// {
//   merkleTreeDepth: number,
//   merkleTreeRoot: bigint,
//   nullifier: bigint,
//   message: bigint,
//   scope: bigint,
//   points: bigint[8]
// }

// Off-chain verification
const isValid = await verifyProof(proof)  // returns boolean
```

### Fetching On-Chain Group Data

```typescript
import { SemaphoreSubgraph } from "@semaphore-protocol/data"

const subgraph = new SemaphoreSubgraph("sepolia") // or "ethereum", etc.

// Get group members to reconstruct the group off-chain
const { members } = await subgraph.getGroup("42", { members: true })
const group = new Group(members)
```

---

## Solidity Integration

### ISemaphore Interface

The deployed Semaphore contract exposes all group management and proof verification. Our contracts (VoterRegistry, DisputeResolver) interact with it via the `ISemaphore` interface.

```solidity
import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
```

### Key Structs

```solidity
// Proof data passed to validateProof/verifyProof
struct SemaphoreProof {
    uint256 merkleTreeDepth;
    uint256 merkleTreeRoot;
    uint256 nullifier;
    uint256 message;
    uint256 scope;
    uint256[8] points;
}
```

### Group Management Functions

```solidity
// Create a new group (caller becomes admin)
function createGroup() external returns (uint256 groupId);

// Create group with explicit admin
function createGroup(address admin) external returns (uint256 groupId);

// Create group with admin + custom Merkle tree root duration
function createGroup(address admin, uint256 merkleTreeDuration) external returns (uint256 groupId);

// Transfer admin (two-step: update then accept)
function updateGroupAdmin(uint256 groupId, address newAdmin) external;
function acceptGroupAdmin(uint256 groupId) external;

// Set how long old Merkle roots remain valid (default: 1 hour)
function updateGroupMerkleTreeDuration(uint256 groupId, uint256 newMerkleTreeDuration) external;

// Add single member
function addMember(uint256 groupId, uint256 identityCommitment) external;

// Add multiple members
function addMembers(uint256 groupId, uint256[] calldata identityCommitments) external;

// Update member (requires Merkle proof siblings computed off-chain)
function updateMember(
    uint256 groupId,
    uint256 oldIdentityCommitment,
    uint256 newIdentityCommitment,
    uint256[] calldata merkleProofSiblings
) external;

// Remove member (requires Merkle proof siblings computed off-chain)
function removeMember(
    uint256 groupId,
    uint256 identityCommitment,
    uint256[] calldata merkleProofSiblings
) external;
```

### Proof Verification Functions

```solidity
// Validates proof, saves nullifier, emits ProofValidated event.
// Reverts if nullifier already used or proof invalid.
// Use this for state-changing operations (e.g., casting a vote).
function validateProof(uint256 groupId, ISemaphore.SemaphoreProof calldata proof) external;

// View-only verification — returns true/false, no state changes.
// Use this for dry-run checks.
function verifyProof(uint256 groupId, ISemaphore.SemaphoreProof calldata proof) external view returns (bool);
```

### Errors

```solidity
error Semaphore__GroupHasNoMembers();
error Semaphore__MerkleTreeDepthIsNotSupported();    // depth must be 1-32
error Semaphore__MerkleTreeRootIsExpired();           // old root past duration
error Semaphore__MerkleTreeRootIsNotPartOfTheGroup();
error Semaphore__YouAreUsingTheSameNullifierTwice();  // double-signal prevention
error Semaphore__InvalidProof();
```

### Events

```solidity
event GroupMerkleTreeDurationUpdated(
    uint256 indexed groupId,
    uint256 oldMerkleTreeDuration,
    uint256 newMerkleTreeDuration
);

event ProofValidated(
    uint256 indexed groupId,
    uint256 merkleTreeDepth,
    uint256 indexed merkleTreeRoot,
    uint256 nullifier,
    uint256 message,
    uint256 indexed scope,
    uint256[8] points
);
```

### Integration Pattern (Our Use Case)

```solidity
// VoterRegistry.sol or DisputeResolver.sol
import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

contract DisputeResolver {
    ISemaphore public semaphore;
    uint256 public voterGroupId;

    constructor(ISemaphore _semaphore, uint256 _voterGroupId) {
        semaphore = _semaphore;
        voterGroupId = _voterGroupId;
    }

    // Cast anonymous vote on a dispute
    // - scope should be unique per dispute (e.g., bountyId or disputeId)
    // - message encodes the vote (e.g., 1 = approve, 0 = reject)
    function castVote(ISemaphore.SemaphoreProof calldata proof) external {
        // validateProof reverts if:
        // - proof is invalid
        // - nullifier already used (double vote)
        // - Merkle root expired or not in group
        semaphore.validateProof(voterGroupId, proof);

        // proof.message = vote (0 or 1)
        // proof.scope = disputeId
        // proof.nullifier = unique per voter per dispute
        // ... tally logic here
    }
}
```

---

## Deployed Contract Addresses (V4)

All three contracts share the **same address across all networks**:

| Contract | Address |
|----------|---------|
| **Semaphore** | `0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D` |
| **SemaphoreVerifier** | `0x4DeC9E3784EcC1eE002001BfE91deEf4A48931f8` |
| **PoseidonT3** | `0xB43122Ecb241DD50062641f089876679fd06599a` |

Networks: Ethereum, Sepolia, Arbitrum, Arbitrum-Sepolia, Optimism, Optimism-Sepolia, Base, Base-Sepolia, Polygon (Matic), Polygon Amoy, Linea, Linea-Sepolia, Scroll-Sepolia, Gnosis, Gnosis Chiado.

**For our project:** Use `0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D` on Ethereum mainnet (production) and Sepolia (testnet).

---

## How We Use Semaphore

Per SPEC.md, Semaphore handles anonymous dispute voting:

1. **VoterRegistry.sol** creates a Semaphore group via the deployed Semaphore contract
2. When a user verifies via Reclaim Protocol, VoterRegistry adds their identity commitment to the group (`semaphore.addMember(groupId, commitment)`)
3. During disputes, voters generate proofs client-side (`generateProof(identity, group, message, scope)`) where:
   - `message` = vote (1 = approve dev's work, 0 = reject)
   - `scope` = dispute/bounty ID (ensures one vote per person per dispute)
4. **DisputeResolver.sol** calls `semaphore.validateProof(groupId, proof)` to verify + record the vote
5. Nullifiers prevent double-voting; scope isolation means voting in one dispute doesn't reveal votes in another

### Key Design Points

- **Merkle tree duration**: Set appropriately — if members are added during a vote, old proofs generated before the addition remain valid for this duration (default 1 hour). Consider setting longer for our voting periods.
- **Group admin**: Our VoterRegistry contract should be the group admin (so it can add members when Reclaim proofs are verified).
- **Scope strategy**: Use the bounty/dispute ID as scope. This gives each dispute its own nullifier space — voters can participate in multiple disputes without linkability.

---

## Circuit Parameters

- **MAX_DEPTH**: 1–32 (Merkle tree depth). Depth 20 supports ~1M members, depth 32 supports ~4B.
- **Trusted setup**: Completed July 2024 with 400+ participants.

---

## External Links

- Docs: https://docs.semaphore.pse.dev/
- GitHub: https://github.com/semaphore-protocol/semaphore
- NPM core: https://www.npmjs.com/package/@semaphore-protocol/core
- NPM contracts: https://www.npmjs.com/package/@semaphore-protocol/contracts
- Boilerplate app: https://github.com/semaphore-protocol/boilerplate
- V4 spec: https://github.com/zkspecs/zkspecs/blob/main/specs/3/README.md
