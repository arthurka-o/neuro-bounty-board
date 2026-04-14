"use client";

import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CHAIN } from "@/lib/contracts";
import "@rainbow-me/rainbowkit/styles.css";

const config = getDefaultConfig({
  appName: "Neuro Bounty Board",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "PLACEHOLDER",
  chains: [CHAIN],
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
