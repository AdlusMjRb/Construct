import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { ogGalileo } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Construct",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  chains: [ogGalileo],
  ssr: false,
});
