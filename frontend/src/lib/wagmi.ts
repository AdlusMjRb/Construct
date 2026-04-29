import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { ogGalileo, sepolia } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Construct",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  chains: [ogGalileo, sepolia],
  ssr: false,
});
