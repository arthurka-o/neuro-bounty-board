import { AuthProvider } from "@openfort/react";

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === "sepolia";

export const walletConfig = {
  shieldPublishableKey: process.env.NEXT_PUBLIC_SHIELD_API_KEY!,
  connectOnLogin: true,
  ethereum: {
    ethereumFeeSponsorshipId: isTestnet
      ? process.env.NEXT_PUBLIC_OPENFORT_POLICY_ID
      : undefined,
  },
};

export const uiConfig = {
  theme: "soft" as const,
  mode: "light" as const,
  authProviders: isTestnet
    ? [AuthProvider.EMAIL_OTP, AuthProvider.GUEST, AuthProvider.WALLET]
    : [AuthProvider.WALLET],
};
