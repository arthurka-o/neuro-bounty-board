import { BigInt } from "@graphprotocol/graph-ts";
import {
  DisputeOpened,
  VoteCast,
  DisputeResolved,
  DisputeExtended,
  DisputeEscalated,
} from "../generated/DisputeResolver/DisputeResolver";
import { Bounty, Dispute, Vote } from "../generated/schema";

export function handleDisputeOpened(event: DisputeOpened): void {
  let dispute = new Dispute(event.params.bountyId.toString());
  dispute.bounty = event.params.bountyId.toString();
  dispute.votingEnd = event.params.votingEnd;
  dispute.approveCount = 0;
  dispute.rejectCount = 0;
  dispute.status = "Voting";
  dispute.extended = false;
  dispute.save();

  let bounty = Bounty.load(event.params.bountyId.toString());
  if (bounty) {
    bounty.dispute = dispute.id;
    bounty.save();
  }
}

export function handleVoteCast(event: VoteCast): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();
  let vote = new Vote(id);
  vote.dispute = event.params.bountyId.toString();
  vote.message = event.params.message.toI32();
  vote.timestamp = event.block.timestamp;
  vote.save();

  let dispute = Dispute.load(event.params.bountyId.toString());
  if (!dispute) return;
  if (event.params.message.toI32() == 1) {
    dispute.approveCount += 1;
  } else {
    dispute.rejectCount += 1;
  }
  dispute.save();
}

export function handleDisputeResolved(event: DisputeResolved): void {
  let dispute = Dispute.load(event.params.bountyId.toString());
  if (!dispute) return;
  dispute.status = "Resolved";
  dispute.save();
}

export function handleDisputeExtended(event: DisputeExtended): void {
  let dispute = Dispute.load(event.params.bountyId.toString());
  if (!dispute) return;
  dispute.votingEnd = event.params.newVotingEnd;
  dispute.extended = true;
  dispute.status = "Extended";
  dispute.save();
}

export function handleDisputeEscalated(event: DisputeEscalated): void {
  let dispute = Dispute.load(event.params.bountyId.toString());
  if (!dispute) return;
  dispute.status = "Escalated";
  dispute.save();
}
