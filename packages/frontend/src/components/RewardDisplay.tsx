import { formatTokenAmount } from "@/lib/contracts";

export function RewardDisplay({ amount }: { amount: string }) {
  return (
    <div className="shrink-0 text-center sm:text-right">
      <p className="text-xs text-outline font-medium mb-1">Bounty Reward</p>
      <p className="text-4xl font-extrabold text-secondary font-headline sm:text-5xl">
        {formatTokenAmount(amount)}
      </p>
    </div>
  );
}
