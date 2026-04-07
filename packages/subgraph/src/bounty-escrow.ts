import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  BountyCreated,
  BountyCancelled,
  DevApproved,
  BondStaked,
  DeliverableSubmitted,
  DeliverableApproved,
  DeliverableRejected,
  BountyExpired,
  BountyResolved,
} from "../generated/BountyEscrow/BountyEscrow";
import { Bounty } from "../generated/schema";

export function handleBountyCreated(event: BountyCreated): void {
  let bounty = new Bounty(event.params.bountyId.toString());
  bounty.sponsor = event.params.sponsor;
  bounty.reward = event.params.reward;
  bounty.deadline = event.params.deadline;
  bounty.status = "Open";
  bounty.createdAt = event.block.timestamp;
  bounty.createdTx = event.transaction.hash;
  bounty.save();
}

export function handleBountyCancelled(event: BountyCancelled): void {
  let bounty = Bounty.load(event.params.bountyId.toString());
  if (!bounty) return;
  bounty.status = "Cancelled";
  bounty.save();
}

export function handleDevApproved(event: DevApproved): void {
  let bounty = Bounty.load(event.params.bountyId.toString());
  if (!bounty) return;
  bounty.dev = event.params.dev;
  bounty.bondStakeDeadline = event.params.bondStakeDeadline;
  bounty.status = "Applied";
  bounty.save();
}

export function handleBondStaked(event: BondStaked): void {
  let bounty = Bounty.load(event.params.bountyId.toString());
  if (!bounty) return;
  bounty.bond = event.params.bondAmount;
  bounty.deadline = event.block.timestamp.plus(bounty.deadline); // duration → absolute
  bounty.status = "Active";
  bounty.save();
}

export function handleDeliverableSubmitted(event: DeliverableSubmitted): void {
  let bounty = Bounty.load(event.params.bountyId.toString());
  if (!bounty) return;
  bounty.proofURI = event.params.proofURI;
  bounty.submissionTime = event.block.timestamp;
  bounty.status = "Submitted";
  bounty.save();
}

export function handleDeliverableApproved(event: DeliverableApproved): void {
  let bounty = Bounty.load(event.params.bountyId.toString());
  if (!bounty) return;
  bounty.status = "Approved";
  bounty.save();
}

export function handleDeliverableRejected(event: DeliverableRejected): void {
  let bounty = Bounty.load(event.params.bountyId.toString());
  if (!bounty) return;
  bounty.status = "Disputed";
  bounty.save();
}

export function handleBountyExpired(event: BountyExpired): void {
  let bounty = Bounty.load(event.params.bountyId.toString());
  if (!bounty) return;
  bounty.status = "Expired";
  bounty.save();
}

export function handleBountyResolved(event: BountyResolved): void {
  let bounty = Bounty.load(event.params.bountyId.toString());
  if (!bounty) return;
  bounty.status = "Resolved";
  bounty.save();
}
