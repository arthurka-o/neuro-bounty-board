"use client";

import { type ReactNode } from "react";
import { OpenfortProvider } from "@openfort/react";
import { getDefaultConfig, OpenfortWagmiBridge } from "@openfort/react/wagmi";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CHAIN } from "@/lib/contracts";
import { walletConfig, uiConfig } from "@/lib/openfort";

const config = createConfig(
  getDefaultConfig({
    appName: "Neuro Bounty Board",
    chains: [CHAIN],
    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
    transports: {
      [CHAIN.id]: http(),
    },
    ssr: true,
  }),
);

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <OpenfortWagmiBridge>
          <OpenfortProvider
            publishableKey={
              process.env.NEXT_PUBLIC_OPENFORT_PUBLIC_KEY!
            }
            walletConfig={walletConfig}
            uiConfig={uiConfig}
          >
            {children}
          </OpenfortProvider>
        </OpenfortWagmiBridge>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
