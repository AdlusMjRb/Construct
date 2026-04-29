import { createPublicClient, http } from "viem";
import { sepolia } from "./chains";

export const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});
