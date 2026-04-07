import { base } from "wagmi/chains";
import { bountyEscrowAbi } from "./abi/BountyEscrow";
import { disputeResolverAbi } from "./abi/DisputeResolver";
import { voterRegistryAbi } from "./abi/VoterRegistry";

export const CHAIN = base;

export const contracts = {
  bountyEscrow: {
    address: "0x756aC998B595f95F5bfC4092dBC043857430A806" as const,
    abi: bountyEscrowAbi,
  },
  disputeResolver: {
    address: "0x480Fa0aBe7d016701CbbAAF33a4D802BD6034c7e" as const,
    abi: disputeResolverAbi,
  },
  voterRegistry: {
    address: "0x7f1A5C01dE6E6Db59aA820d5049F7b89c3338d4A" as const,
    abi: voterRegistryAbi,
  },
} as const;

export { bountyEscrowAbi, disputeResolverAbi, voterRegistryAbi };
