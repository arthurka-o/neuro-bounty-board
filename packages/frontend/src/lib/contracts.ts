import { base, baseSepolia } from "wagmi/chains";
import { bountyEscrowAbi } from "./abi/BountyEscrow";
import { disputeResolverAbi } from "./abi/DisputeResolver";

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === "sepolia";

export const CHAIN = isTestnet ? baseSepolia : base;

export const TOKEN_ADDRESS = isTestnet
  ? ("0xdCeB93598060B0677ef376Ab9Ed1f1e9bAcCA880" as const) // NEUR on Base Sepolia
  : ("0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const); // EURC on Base

/** Display symbol for the reward token */
export const TOKEN_SYMBOL = isTestnet ? "nEUR" : "€";

/** Label for approve button text */
export const TOKEN_NAME = isTestnet ? "nEUR" : "EURC";

export const contracts = {
  bountyEscrow: {
    address: isTestnet
      ? ("0x7f1A5C01dE6E6Db59aA820d5049F7b89c3338d4A" as const)
      : ("0x1005c4231E5A687F41A15277cEc416d4A9D3649e" as const),
    abi: bountyEscrowAbi,
  },
  disputeResolver: {
    address: isTestnet
      ? ("0x756aC998B595f95F5bfC4092dBC043857430A806" as const)
      : ("0xF7bBF83bdA864b7298eeBfB509c887033226FaB4" as const),
    abi: disputeResolverAbi,
  },
} as const;

export { bountyEscrowAbi, disputeResolverAbi };
