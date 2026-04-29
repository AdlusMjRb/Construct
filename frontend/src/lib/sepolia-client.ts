import { createPublicClient, http } from "viem";
import { sepolia } from "./chains";

export const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

// PublicResolver on Sepolia. Each ENS resolver has its own approval mapping
// (independent of NameWrapper and ENS Registry). For writing text records on
// wrapped names, this is the relevant approval target — registry-level
// authorisation doesn't cascade through to record writes.
export const PUBLIC_RESOLVER_ADDRESS =
  "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as const;

export const NAME_WRAPPER_ADDRESS =
  "0x0635513f179D50A207757E05759CbD106d7dFcE8" as const;

export const MPC_WALLET_ADDRESS =
  "0xFc49AFB213B4284D9Ab5c1175ACE87b65cf440ce" as const;

// Resolver doesn't expose a public isApprovedForAll view (storage is
// internal), so we can't cheaply check before prompting. We track approval
// state in localStorage as a UX optimisation — if the user has already
// approved this resolver in the past, skip the prompt. False positives are
// harmless (user gets re-prompted), false negatives are acceptable.
export const RESOLVER_APPROVAL_ABI = [
  {
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
