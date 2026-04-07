import { VoterRegistered } from "../generated/VoterRegistry/VoterRegistry";
import { Voter } from "../generated/schema";

export function handleVoterRegistered(event: VoterRegistered): void {
  let voter = new Voter(event.params.userHash.toHexString());
  voter.identityCommitment = event.params.identityCommitment;
  voter.registeredAt = event.block.timestamp;
  voter.save();
}
