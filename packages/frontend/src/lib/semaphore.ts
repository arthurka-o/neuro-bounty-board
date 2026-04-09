import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof, type SemaphoreProof } from "@semaphore-protocol/proof";
import { keccak256, encodePacked, type Hex } from "viem";

const SCOPE_PREFIX = keccak256(encodePacked(["string"], ["neuro-bounty-board.dispute"]));

/**
 * Derives a deterministic Semaphore identity from a wallet signature.
 * The user signs a fixed message; the signature becomes the identity's private key.
 */
export async function getOrCreateIdentity(
  signMessage: (args: { message: string }) => Promise<Hex>,
): Promise<Identity> {
  const signature = await signMessage({
    message: "Sign to create your anonymous voting identity for Neuro Bounty Board.\n\nThis does not cost gas.",
  });
  return new Identity(signature);
}

/**
 * Computes the dispute scope matching the on-chain `disputeScope(bountyId)`.
 */
export function disputeScope(bountyId: number): bigint {
  return BigInt(
    keccak256(encodePacked(["bytes32", "uint256"], [SCOPE_PREFIX, BigInt(bountyId)])),
  );
}

/**
 * Generates a Semaphore ZK proof for anonymous voting.
 * Called after joinDisputeGroup() has already added the voter to the on-chain group.
 * The proof proves group membership and encodes the vote without revealing identity.
 *
 * @param identity - The voter's Semaphore identity
 * @param members - All current group members (from subgraph, including self)
 * @param bountyId - The bounty being disputed
 * @param vote - 1 = approve, 0 = reject
 */
export async function generateVoteProof(
  identity: Identity,
  members: bigint[],
  bountyId: number,
  vote: 0 | 1,
): Promise<SemaphoreProof> {
  const group = new Group(members);
  const scope = disputeScope(bountyId);
  return generateProof(identity, group, vote, scope);
}
