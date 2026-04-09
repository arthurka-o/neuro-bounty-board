import { base } from "wagmi/chains";
import { bountyEscrowAbi } from "./abi/BountyEscrow";
import { disputeResolverAbi } from "./abi/DisputeResolver";

export const CHAIN = base;

export const contracts = {
  bountyEscrow: {
    address: "0x1005c4231E5A687F41A15277cEc416d4A9D3649e" as const,
    abi: bountyEscrowAbi,
  },
  disputeResolver: {
    address: "0xF7bBF83bdA864b7298eeBfB509c887033226FaB4" as const,
    abi: disputeResolverAbi,
  },
} as const;

export { bountyEscrowAbi, disputeResolverAbi };
