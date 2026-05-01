# Construct — Architecture

This document is the technical reference for how Construct is built. It covers the system as a whole, each major component in depth, and the design decisions that shaped the current architecture.

The [README](../README.md) is the pitch. This doc is the answer to _"how does it actually work."_

---

## Contents

1. [Overview](#1-overview)
2. [System diagram](#2-system-diagram)
3. [The pipeline](#3-the-pipeline)
4. [Component deep-dive](#4-component-deep-dive)
   - 4.1 [Smart contracts](#41-smart-contracts)
   - 4.2 [Backend](#42-backend)
   - 4.3 [Frontend](#43-frontend)
   - 4.4 [Trust Stack](#44-trust-stack)
   - 4.5 [Claude integration](#45-claude-integration)
   - 4.6 [0G integration](#46-0g-integration)
   - 4.7 [ENS intergration](#47-ENS-integration)
   - 4.8 [KeeperHub + Turnkey integration](#48-keeperhub--turnkey-integration)
5. [Custody model](#5-custody-model)
6. [Fallback architecture](#6-fallback-architecture)
7. [Resilience patterns](#7-resilience-patterns)
8. [Security considerations](#10-security-considerations)

---

## 1. Overview

Construct is a thin orchestration layer across systems that each do one thing well. The core value is not in any single component, it's in the composition. A Claude API call, a smart contract, an MPC wallet, and a content-addressed storage layer each exist elsewhere. What's novel is running them as one coherent pipeline where every link is decentralised or independently verifiable.

The system has three functional surfaces:

- **Planning surface** — a Claude Sonnet call that converts natural language into structured, machine-verifiable milestone specifications.
- **Verification surface** — a multi-layer authenticity check (the Trust Stack) followed by a Claude Vision call that assesses evidence against the structured criteria.
- **Settlement surface** — a Solidity escrow contract on 0G Chain with a separate owner/agent role split, released by an MPC wallet routed via KeeperHub.
- **Identity surface** — a wrapped ENS subname on Sepolia, owned by the funder, with text records on the resolver bridging to the 0G escrow state. Project ownership is portable; transferring the subname NFT transfers the project.
- **Continuity surface** — a project handover flow that survives the original builder. The ENS subname is transferable; the on-chain escrow state and 0G Storage spec are recoverable. A new wallet inherits the project, deploys a fresh escrow, and the same NFT repoints to it — one project, one identity, multiple escrows over its lifetime.

Each surface is designed to be replaced without rewriting the others. Claude Sonnet could become a fine-tuned model. Reality Defender could be swapped for a different AI-detection API. KeeperHub's MPC wallet could become an ERC-4337 smart account. The contract stays the same because the interfaces are configurable at deployment time. The architecture is also cross-chain by design. Settlement and storage are co-located on 0G (the chain purpose-built for AI-native applications, where the canonical milestone spec lives in 0G Storage with its hash embedded in the escrow contract); identity is on ENS, which is canonical on Ethereum (Sepolia for the hackathon, mainnet in production). The split exists because each chain is the right substrate for what runs on it. A single MPC wallet signs across both, so the cross-chain footprint is invisible to the funder, they see one unified project, even though it spans two chains. This is accessibility by design.

## 1. System Diagram

![](//frontend/src/assets/construct-architecture.svg)

## 2. The pipeline

The user-facing flow is five phases: **Describe → Plan → Deploy → Verify → Release**. Each phase corresponds to a specific sequence of API calls, storage writes, and on-chain actions.

### 2.1 Describe

The funder writes a natural-language project description in any of the six supported languages (English, Ukrainian, Arabic, Spanish, French, Swahili). The frontend captures the description and project parameters (builder address, total budget, deadline) and `POST`s them to the backend as JSON.

The description is treated as canonical in whatever language it was entered. A separate translation pipeline provides view-layer translations for multilingual teams, but the canonical record, the one the agent reads when verifying, is always in the language the funder wrote.

### 2.2 Plan

`POST /api/prepare-project` receives the description, passes it to Claude Sonnet via the tool-use API with a structured output schema, and receives back a `milestones[]` array where each milestone has:

- `name` and `description` (human-readable)
- `percentage` (share of the total budget)
- `acceptance_criteria[]` — each criterion has a structured `evidence_type`, a specific `evidence_instruction`, and a `verification_confidence` threshold

The full spec (description + milestones) is then uploaded to 0G Storage via the `@0gfoundation/0g-ts-sdk`. 0G returns a content hash, a 32-byte reference that both identifies the content and guarantees its integrity. That hash is the pointer that will be embedded on-chain.

### 2.3 Deploy

The backend responds to the frontend with `{abi, bytecode, constructorArgs, agentAddress, storageHash, requiredFunding}`. The frontend uses wagmi's `useWalletClient` to deploy the contract from the funder's own connected wallet.

Critically, **the deployment transaction is also the funding transaction**. The `MilestoneEscrow` constructor is payable, and the funder sends `budget + agentFee` as `msg.value` with the deployment call. One wallet signature covers both actions.

The constructor stores:

- The owner (`msg.sender` — the funder's wallet)
- The agent (`KEEPERHUB_AGENT_ADDRESS` — the Turnkey MPC wallet used for autonomous releases)
- The builder address (the payee for milestone releases)
- The milestone array (names + percentages)
- The 0G Storage hash of the full spec

It also executes the fee split at deployment time: half of the 5% agent fee is transferred directly to the MPC wallet (priming it with gas for future `completeMilestone()` calls), and half is held as a gas reserve inside the contract.

Cross-chain identity mint:

Once the 0G escrow confirms, the deploy flow continues into a Sepolia identity mint. The backend POSTs to a second KeeperHub workflow, which calls `setSubnodeOwner` on the ENS NameWrapper, minting a wrapped subname under `construct.eth` (e.g.` <project-slug>.construct.eth`) owned by the funder's wallet. Subname fuses are set to `PARENT_CANNOT_CONTROL` | `CANNOT_UNWRAP` (`65537`) so the subname is fully transferable as an NFT and immune to parent revocation.

The funder is then prompted, in the same deploy flow, for one transaction on Sepolia: `setApprovalForAll` on the PublicResolver, granting the MPC wallet permission to write text records on the funder's behalf. This approval is per-(owner, operator), not per-name, a single grant covers every project the funder ever creates. The frontend caches this in `localStorage` so subsequent projects on the same wallet skip the prompt.

With approval in place, the backend writes the initial text record set in parallel via a third KeeperHub workflow (`setText`) — `escrow_address`, `escrow_chain`, `status`, `payee`, `milestone_count`, `current_milestone`, and a stub `project_manifest` slot for later. Writes are fire-and-forget; the user reaches the verification phase immediately while records confirm in the background (~15-30s).

The MPC wallet keeps these records in sync as milestones complete. The subname is now the project's portable identity: anyone who holds it can read the full project state from a single ENS lookup, regardless of where the underlying escrow lives.

### 2.4 Verify

The builder uploads evidence against a specific milestone. `POST /api/verify-evidence` receives the files along with the milestone ID and contract address.

The backend then runs two sequential passes:

**Pass 1 — Trust Stack.** Every image is run through four provenance layers in parallel:

1. EXIF metadata analysis (`exifr`)
2. C2PA content credentials (`@trustnxt/c2pa-ts`)
3. Reality Defender AI-generation detection (`@realitydefender/realitydefender`)
4. Pricing Oracle (prompt-engineered into Claude's verification call)

Each layer returns a structured result with a status (`authentic` / `suspicious` / `no_data` / `real` / `ai_generated` / `no_manifest`). A combined trust verdict is computed across all layers.

**Pass 2 — Claude Vision.** The original evidence images (resized to fit Claude's 5MB input limit via `sharp`, but with Trust Stack having run on the original unmodified buffer for EXIF preservation), the acceptance criteria, and the Trust Stack output are all sent to Claude Vision with a structured verification schema. Claude returns `APPROVE` or `ESCALATE` along with per-criterion assessment, reasoning, and confidence.

If Trust Stack's Reality Defender flags the image as AI-generated above 70% probability, Claude Vision is instructed to escalate regardless of visual assessment. Provenance signals inform the verdict; they cannot be overridden by a passing visual check alone.

### 2.5 Release

On `APPROVE`, the backend `POST`s to KeeperHub's webhook with `{contractAddress, milestoneId}`. The KeeperHub workflow resolves the template and calls `completeMilestone(milestoneId)` on the escrow contract using the Turnkey MPC wallet as `msg.sender`.

The contract's `onlyOwnerOrAgent` modifier permits the call. Funds are released to the builder. The agent's gas cost is refunded from the reserve. If this is the final milestone, the unused reserve is returned to the funder.

The backend does not rely on KeeperHub's status endpoint to detect completion (it returns 500 on the self-hosted build — see §7). Instead, it polls the contract's `milestones(id).completed` flag directly. Once the flag flips to true, it queries the `MilestoneCompleted` event log to retrieve the actual transaction hash and returns it to the frontend.

On `ESCALATE`, no autonomous action occurs. The frontend renders the escalated card with the AI's reasoning visible, and the funder can click "Approve & Release" to call `completeMilestone()` directly from their own wallet, no backend, no MPC, the funder's own signature.

On `APPROVE`, the agent also updates the project's ENS state on Sepolia. The same MPC wallet that signed `completeMilestone` on 0G is fired through KeeperHub's `setText` workflow on Sepolia, updating the `current_milestone` index and (if it was the final milestone) the `status` record from `in_progress` to `completed`. The escrow on 0G is the source of truth; the ENS records are the bridge that makes the project state legible to anything reading the subname.

### 2.6 Handover (optional, when continuity is needed)

If the original builder fails or the project changes hands mid-flight, Construct supports a non-destructive handover. The flow has three on-chain steps and is designed so the audit trail is sealed _before_ the NFT moves.

**Step 1 — Seal the old escrow's records.** The funder triggers `POST /api/projects/handover` from their wallet. The MPC, still operating under the funder's resolver approval, writes two final records to the existing subname: `status: "handed_over"` and `handed_over_to: <recipient address>`. These writes happen first because once the NFT transfers, the recipient's resolver approval has not yet been granted, and the MPC loses its write authority for that name. Sealing first preserves the audit invariant: a project marked `handed_over` always carries the address it was handed to.

**Step 2 — Transfer the NFT.** With records sealed, the funder signs `safeTransferFrom` on the Sepolia NameWrapper, moving the wrapped subname (ERC-1155) to the recipient. Ownership of the project's identity has now shifted; the underlying 0G escrow on the old contract is unchanged but no longer linked to an active builder.

**Step 3 — Recipient loads the project.** The recipient connects their wallet to Construct and clicks _Load Existing Project_. The backend (`GET /api/projects/by-owner/:wallet`) queries the subname registry, then re-verifies ownership against `NameWrapper.balanceOf` on Sepolia. For each owned subname, the recipient can call `GET /api/projects/load/:subname`, which:

1. Reads the text records from Sepolia to find the old escrow address and 0G Storage hash.
2. Reads the old escrow's milestone state from 0G Chain to determine which milestones were already completed.
3. Downloads the original spec from 0G Storage to recover acceptance criteria, evidence instructions, and confidence thresholds.
4. Returns the _remaining_ milestones as a continuation spec, with the old payee address as a default for the new escrow.

**Step 4 — Repoint.** The recipient reviews the inherited milestones, optionally re-prices them (the recipient may negotiate different rates), locks them, and deploys a fresh `MilestoneEscrow` contract on 0G Chain — funding it themselves in the same transaction. Because the recipient's resolver approval has not yet been granted, they sign a one-off `setApprovalForAll` on the Sepolia PublicResolver as part of the same flow.

Once the new escrow is live, `POST /api/projects/repoint` writes seven records to the _same_ subname:

- `escrow_address` → new escrow contract on 0G
- `escrow_chain` → `16602`
- `status` → `in_progress`
- `payee` → new builder address (often the recipient themselves)
- `milestone_count` → number of remaining milestones
- `current_milestone` → `0`
- `handed_over_to` → empty string (clears the handover marker)

The subname now points at a new escrow with new terms but the same identity. Anyone reading the subname sees an active project; anyone reading the _old_ escrow on 0G sees a settled contract whose ENS link has moved on. _One project, one NFT, multiple escrows over its life._

The continuation flow is non-destructive: the old escrow, its completed milestones, and any unspent funds remain on-chain. A future protocol upgrade may surface unspent funds for refund or roll-forward (see §11 roadmap).

---

## 3. Component deep-dive

### 3.1 Smart contracts

The on-chain surface is two contracts. `EscrowFactory` is a planned addition (see [§11](#11-production-roadmap)); the current build deploys `MilestoneEscrow` directly per project.

**`MilestoneEscrow.sol`** — the per-project escrow.

Key state:

```solidity
address public owner;        // funder's wallet — deploys + funds
address public agent;        // executor — MPC wallet (or server wallet fallback)
address public builder;      // payee for all milestone releases
uint256 public budget;       // total builder payment (excludes agent fee)
uint256 public agentFee;     // 5% of budget, charged on top
uint256 public agentGasReserve; // half of agentFee, held for gas refunds
string  public storageHash;  // 0G Storage content hash of the full spec
Milestone[] public milestones;
```

Key functions:

```solidity
constructor(/* … */) payable                  // deploy + fund in one tx
function completeMilestone(uint256 id)        // release; onlyOwnerOrAgent
function getMilestones() external view        // read all milestones
function getRequiredFunding() external view   // budget + agentFee
```

The `onlyOwnerOrAgent` modifier is the core of the custody architecture. The owner can always release a milestone manually (the escalation path). The agent can release autonomously (the straight path). Nobody else can trigger a release, regardless of key compromise elsewhere in the system.

The agent fee is structured as _budget + fee_ rather than _fee deducted from budget_. If the funder agrees to pay the builder £5,000, the builder receives £5,000 and the platform fee is a separate line item, matching construction-industry practice rather than SaaS-style hidden fees.

### 3.2 Backend

Express on Node.js v25 with ESM modules. Runs on port 3001. Proxied through Vite during development.

Principal routes:

| Route                              | Purpose                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/prepare-project`        | Claude Sonnet milestone generation + 0G Storage upload; returns deployment payload |
| `POST /api/verify-evidence`        | Trust Stack + Claude Vision verification; triggers KeeperHub webhook on approval   |
| `POST /api/translate`              | Translates a milestone spec for display in a target language                       |
| `POST /api/translate-verification` | Translates a verification result for display                                       |
| `GET /api/health`                  | Surface which execution path is active (KeeperHub or server wallet)                |

Principal services:

| Module                        | Responsibility                                                               |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `src/services/claude.mjs`     | Claude Sonnet (planning) + Claude Vision (verification) tool-use clients     |
| `src/services/provenance.mjs` | Trust Stack — EXIF, C2PA, Reality Defender, combined trust-level computation |
| `src/services/storage.mjs`    | 0G Storage SDK wrapper (upload + retrieval)                                  |
| `src/services/blockchain.mjs` | ethers.js contract interaction — deploy, poll, event log query               |
| `src/services/keeperhub.mjs`  | Webhook client + bearer-token auth + completion polling                      |
| `src/services/translate.mjs`  | Claude-backed translation of display-layer content                           |

The canonical-record invariant is enforced at this layer: **the verification routes always read from the canonical `milestones[]` array, never from `displayMilestones` or translated copies.** Mutating a canonical field to a translated value would silently break audit reconciliation without raising an error. A comment in `handleVerifySingle` marks the relevant line.

### 3.3 Frontend

React 19 + TypeScript + Vite + Tailwind 4. Single-page app organised as three shutters (see [DESIGN.md §5](./DESIGN.md#5-layout-system) for the layout model).

Wallet integration uses wagmi v2, viem, and RainbowKit. The connected wallet is used for two transactions:

- Deploying and funding the escrow (`useWalletClient().deployContract`)
- Manual release of escalated milestones (`useWalletClient().writeContract` → `completeMilestone`)

Both are native wagmi actions; the backend is not involved in either signature.

During a session, three kinds of state exist:

- **Canonical state** — what the backend returned and what the contract enforces. Never translated.
- **Display state** — translated copies of spec and verification prose for the user's selected language. Backed by `localStorage` caches keyed by contract address and language.
- **UI state** — current shutter, locked milestones, upload targets, toast messages.

### 3.4 Trust Stack

Four provenance layers running before Claude Vision ever sees the evidence. Each layer is independent, each can pass, fail, or return no signal without affecting the others.

| Layer                    | Library                            | What it catches                                                                      | What it misses                                                                  |
| ------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| EXIF metadata            | `exifr`                            | Screenshots, fully AI-generated images (no camera data), some editing fingerprints   | GPS strips from Android share sheet, EXIF preserved by some AI editing tools    |
| C2PA content credentials | `@trustnxt/c2pa-ts`                | **Any** post-capture modification if the device signed the original                  | ~99.9% of current images have no manifest — adoption is early                   |
| Reality Defender         | `@realitydefender/realitydefender` | Fully AI-generated images (ensemble detection, ~93% confidence on test fakes)        | Localised AI edits on real photographs (e.g. OnePlus 12's object-removal tools) |
| Pricing Oracle           | Claude prompt engineering          | Price inflation (>2× expected retail), material substitution, implausible quantities | Prices within normal variation bands                                            |

The Trust Stack's honesty is part of its design. Each layer has documented failure modes. The point is not that any single layer is foolproof, it's that a fraudster has to beat _all four_ to produce approved evidence, and doing so is demonstrably harder than beating any single commercial provenance check in isolation.

The combined trust verdict feeds into Claude Vision's prompt as context. Claude is instructed to escalate if Reality Defender flags above 70%, regardless of its own visual assessment,preventing the AI from "talking itself out of" a hard signal.

A deeper writeup of the four layers and their attack surface is in `buildLog2.docx`.

### 3.5 Claude integration

Two distinct uses of Claude, with different models, schemas, and system prompts.

**Claude Sonnet for planning.** Called from `POST /api/prepare-project`. Uses tool-use with a forced tool call. The response must conform to a structured milestone schema. The system prompt specifies:

- Acceptance criteria must include a machine-readable `evidence_type` (e.g. `receipt`, `geolocated_photo`, `document`), a specific `evidence_instruction` in plain prose, and a `verification_confidence` threshold.
- Evidence instructions must include scale-aware measurement guidance ("not just 'photo of foundation'; 'photo of foundation with a tape measure visible showing depth ≥ 900mm'").
- Evidence instructions must anticipate adversarial evidence ("if the instruction asks for a receipt, specify which vendor, what date range, and what amount").

**Claude Vision for verification.** Called from `POST /api/verify-evidence`. Receives the milestone acceptance criteria, the Trust Stack output, and the evidence images. Returns a structured verdict via tool use with fields: `verdict` (APPROVE / ESCALATE), `confidence`, per-`criteria_check[]` assessment, `reasoning`, `provenance_assessment`, and `pricing_assessment`.

The model ID is stored in environment configuration and currently points at `claude-sonnet-*`. Both uses are schema-constrained via the tool-use API — freeform text responses are not accepted.

### 3.6 0G integration

Construct uses two 0G products: 0G Chain (EVM-compatible L1) and 0G Storage (content-addressed storage). The same developer wallet funds both.

**0G Chain (Galileo testnet, chain ID 16602).** Standard EVM. Solidity contracts deploy without modification. The project uses Hardhat for compilation and deployment, ethers.js v6.13.1 for runtime interaction. RPC URL is `https://evmrpc-testnet.0g.ai`. Block explorer is `https://chainscan-galileo.0g.ai`.

A note on chain ID drift: some early documentation and community references list `16601`. The correct current value for Galileo is **16602** and is enforced in the wagmi chain config and the Hardhat network config.

**0G Storage.** Used via `@0gfoundation/0g-ts-sdk` v1.2.1 (note: the scope is `@0gfoundation`, not `@0glabs`, a common package-name trap). Content-addressed: uploading a JSON blob returns a hash; the same content always produces the same hash. The hash is embedded in the escrow contract at deployment time, creating an immutable link between the on-chain agreement and the off-chain spec.

Storage uploads require the wallet to have a small OG balance for transaction fees. The indexer endpoint is `https://indexer-storage-testnet-turbo.0g.ai`.

The 0G Storage hash from project deployment is also written to the ENS subname's `project_manifest` text record on completion, creating a verifiable bridge: anyone holding the subname can read the manifest hash, fetch the spec from 0G Storage, and audit it against the on-chain milestone state.

### 4.7 ENS integration

ENS is used on Sepolia (chain ID 11155111) as the project identity layer. The parent name `construct.eth` is owned by the MPC wallet, registered for 5 years, wrapped, with `CANNOT_UNWRAP` burned, making subname mints irrevocable from the parent's side.

Each project mints a wrapped subname owned by the funder. Subname state is held in the resolver's text records; the relevant keys are:

Key----------------------------------Value
| `escrow_address`---------------------| The 0G escrow contract address
| `escrow_chain`-----------------------| "`16602`" (chain ID where the escrow lives)
| `status`-----------------------------| "`in_progress`" / "`completed`"
| `payee`------------------------------| The builder address
| `milestone_count`--------------------| Total milestones in the project
| `current_milestone`------------------| Index of the next pending milestone
| `project_manifest`-------------------| 0G Storage hash of the full project manifest (stub at mint, populated on completion)

The MPC wallet has resolver-level approval (via `PublicResolver.setApprovalForAll`) to write these records on the funder's behalf. The funder grants this approval once per wallet via a single Sepolia transaction; subsequent projects skip the prompt by checking a `localStorage` cache.

A discovery point worth surfacing: resolver approval for wrapped names is on the PublicResolver, not the NameWrapper or the ENS Registry. Each ENS resolver maintains its own `setApprovalForAll` mapping independent of the wrapper. The NameWrapper's `canModifyName` does not propagate to the resolver. Diagnostic scripts that nailed this are kept in `backend/scripts/diag-resolver\*.mjs`.

Backend module: `src/keeperhub/ens.mjs` — exports `slugifyLabel`, `computeSubnameTokenId`, `namehash`, `mintSubname`, `setTextRecord`, `readTextRecord`. All KH webhook logic lives here; routes import from this module rather than duplicating it.

### 3.8 KeeperHub + Turnkey integration

KeeperHub is the execution layer for autonomous milestone releases. Turnkey provides the underlying MPC wallet that KeeperHub routes transactions through.

**Self-hosted, not cloud.** The hosted `app.keeperhub.com` does not yet support 0G Galileo as a target chain. Construct runs KeeperHub locally, with 0G Galileo added to the local Postgres via SQL `INSERT` into the `chains` and `explorer_configs` tables. The workaround is reproducible and documented in `buildLog3.docx`; a detailed feedback writeup to KeeperHub is in `KEEPERHUB_FEEDBACK.md`.

Three webhook-triggered Write Contract workflows. The backend POSTs JSON payloads to three separate KeeperHub workflows, each with a bearer-token Authorization header (self-hosted KeeperHub enforces webhook auth):

| Workflow            | Chain             | Function                                              | Triggered when                                               |
| ------------------- | ----------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `completeMilestone` | completeMilestone | completeMilestone(uint256)                            | Claude Vision approves evidence                              |
| `mintSubname`       | Sepolia           | setSubnodeOwner(bytes32,string,address,uint32,uint64) | Project deploy completes on 0G                               |
| `setText`           | Sepolia           | setText(bytes32,string,string)                        | Initial records on mint, status sync on milestone completion |

Each workflow resolves its template, constructs the transaction, and signs it via the same Turnkey MPC wallet. One agent identity, two chains. The KeeperHub prize submission rests on this: most agents sign on one chain. Construct does the same job across two, from one identity, with no custody.

**Turnkey MPC wallet as both the 0G `_agent` and the ENS operator.** The wallet address is configured at contract deployment via `KEEPERHUB_AGENT_ADDRESS` and is also the operator granted resolver approval on Sepolia. The signing key is split across parties using multi-party computation — no single party (including Turnkey itself) can produce a valid signature alone. From the contract's perspective on either chain, `msg.sender` is a single address; from Paxmata's perspective, it is an address whose key does not exist on any Paxmata server.

### 3.9 Continuity layer (handover + repoint)

The continuity layer turns a project from "this contract" into "this NFT, with whatever contract is currently active." It spans the backend handover routes, the subname registry, and the frontend's load + repoint flow.

**Backend module: `src/routes/handover.mjs`.** Three endpoints:

| Route                                | Purpose                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/projects/by-owner/:wallet` | Returns subnames currently held by the wallet, verified against `NameWrapper.balanceOf` on Sepolia                               |
| `GET /api/projects/load/:subname`    | Reads text records, hydrates the old escrow's state from 0G, fetches original spec from 0G Storage, returns remaining milestones |
| `POST /api/projects/handover`        | Seals `status: handed_over` + `handed_over_to` records on the old subname before NFT transfer                                    |
| `POST /api/projects/repoint`         | Writes the seven-record set that links the same subname to a new escrow                                                          |

The `handover` and `repoint` writes are sequential (KH nonce lock — single MPC wallet across both chains). Failure modes are surfaced as structured `records[]` arrays in the response so the frontend can show partial-success state if the chain rejects a specific write.

**Subname registry: `src/storage/subname-registry.mjs`.** A JSON file at `backend/data/subnames.json` tracks every subname Construct has minted. Each entry stores:

- `subname` — fully qualified name (`<label>.construct.eth`)
- `tokenId` — wrapped subname's ERC-1155 token id
- `currentOwner` — cached owner address; verified live against the NameWrapper on every lookup
- `escrowAddress` — current 0G escrow this subname points at; updated on repoint
- `mintedAt` / `updatedAt` — timestamps

The registry is a cache, not a source of truth. Every read re-verifies ownership against `NameWrapper.balanceOf`, so a stale `currentOwner` value never produces an incorrect result — it just produces an extra RPC call. For the hackathon a JSON file is sufficient; production would back this with Postgres or similar.

**Frontend: load + repoint flow in `App.tsx`.** The recipient's frontend follows a tightly bounded state machine:

1. _Load_ — `apiGetProjectsByOwner` returns owned subnames. If exactly one, it auto-loads. If two or more, a picker modal opens at App level.
2. _Hydrate_ — `apiLoadProject` populates Shutter 2 with remaining milestones. Each milestone arrives with full criteria, evidence instructions, and inherited price. The `inheritedSubname` flag is set in App state.
3. _Adjust + lock_ — the recipient may edit prices before locking. Locking does not commit to the chain; it commits to deployment input.
4. _Deploy_ — when `inheritedSubname` is set, `handleDeploy` skips the `apiMintSubname` call and instead calls `apiRepointSubname` after the new escrow's transaction confirms.

The mint-vs-repoint branch is the entire structural difference between a fresh project and a continuation. Everything downstream — verification, release, ENS sync — is identical.

**Cross-chain authority caveat.** During handover, the MPC's resolver approval is granted _per (owner, operator) pair on the PublicResolver_. When the NFT transfers to a new owner, the MPC's existing approval (granted by the original owner) becomes invalid for that subname — the resolver re-checks `ownerOf(node)` per write call, and the new owner has not yet granted approval. This is why the handover records are written _before_ the NFT moves. After transfer, the recipient grants their own resolver approval as part of their first deploy, restoring the MPC's write authority for any future records on subnames they own.

**Architectural note.** A project's `_agent` address is set at deployment of each escrow. The MPC wallet remains the same identity across handovers because Construct itself is the operator; what changes is the funder/payee/escrow tuple. From the agent's perspective, every project it ever signs for shares one signing identity. From the funder's and recipient's perspective, the agent is invisible — they see only their own wallet on Sepolia and their own escrow on 0G.

---

## 4. Custody model

The custody model is the most important architectural decision in Construct. It exists because autonomous payment systems in the UK and EU hit a regulatory wall the moment anyone can be said to _control_ a key that moves user funds, at which point the operator becomes a custodian and inherits FCA (UK) or equivalent obligations.

The final model eliminates that exposure:

| Action                                     | Who signs                        | Who holds the key          |
| ------------------------------------------ | -------------------------------- | -------------------------- |
| Deploy + fund the escro (0G)               | Funder's own connected wallet    | Funder                     |
| Mint project ENS subname (Sepolia)         | Turnkey MPC wallet via KeeperHub | Nobody, in whole, anywhere |
| Grant resolver approval (Sepolia, one-off) | Funder's own connected wallet    | Funder                     |
| Update ENS records on milestone progress   | Funder's own connected wallet    | Funder                     |
| Autonomous milestone release (happy path)  | Turnkey MPC wallet via KeeperHub | Nobody, in whole, anywhere |
| Manual milestone release (escalation path) | Funder's own connected wallet    | Funder                     |
| Project handover (transfer subname NFT)    | Funder's own connected wallet    | Funder                     |

The same custody guarantee extends to the identity layer. The MPC wallet's resolver approval lets it write text records on subnames the funder owns, but it cannot transfer the subname NFT, change ownership, or affect anything outside that resolver's text-record namespace. Project ownership is the funder's, on both chains.

At no point does any Paxmata-controlled server hold a key that can move escrow funds. The only server-side key is `DEPLOYER_PRIVATE_KEY`, which exists for the fallback execution path (see §6) and is only used when KeeperHub is unavailable, never in a KeeperHub-routed deployment.

This matters for more than regulatory compliance. It matters for the threat model. If a Paxmata server is compromised, the blast radius is bounded: the attacker cannot redirect, withhold, or steal any funds held in active escrows. They can at worst cause a premature approval, which is still bounded by the contract's `completeMilestone` function, which only pays the pre-specified builder address set at deployment. Funds cannot be redirected to the attacker.

---

## 5. Fallback architecture

KeeperHub is the primary execution path. The server wallet is the fallback, used only when KeeperHub is unavailable, which in practice means the live hosted preview (where 0G Galileo isn't on hosted KeeperHub yet).

The backend detects which path is active at startup based on environment configuration:

- If `KEEPERHUB_WEBHOOK_URL` and `KEEPERHUB_AGENT_ADDRESS` are set → KeeperHub path
- Otherwise → server-wallet path

The contract's `_agent` address is set at deployment to match whichever path is active. Both paths use the same `completeMilestone()` function and the same `onlyOwnerOrAgent` modifier. The only difference is who signs the transaction.

The frontend behaves identically under both paths. A startup banner in the backend logs makes the active path visible to operators:

```
[STARTUP] Execution path: KeeperHub (agent: 0xFc49…40ce)
[STARTUP] Execution path: Server wallet (agent: 0xdf6c…B078)
```

---

## 6. Resilience patterns

Several patterns in the current build exist specifically to handle real-world edge cases I hit during development. Each of these is load-bearing and should not be removed without understanding why it was added.

**State polling over event subscription.** 0G Galileo testnet RPC nodes have occasional indexing lag where a state change is visible via `contract.milestones(id).completed` before the corresponding event log is queryable. The backend polls state first, then retries the event query up to 10 times (3 seconds apart) to retrieve the tx hash. If the event still isn't found after 30 seconds, the milestone is marked complete with a fallback link to the contract page on ChainScan.

**Bypass of KeeperHub's status endpoint.** The self-hosted KeeperHub build returns `500 Internal Server Error` on `GET /api/executions/:id` for both successful and failed workflow runs. The workflows themselves execute correctly — the status endpoint just can't read its own state. The backend works around this by ignoring the status endpoint entirely and polling 0G Chain directly. The blockchain is the source of truth.

**Raw-buffer preservation for Trust Stack.** Claude Vision has a 5MB input limit and mobile phone photos routinely exceed it after base64 encoding. `sharp` resizes the image for the Vision call, but the Trust Stack must run on the _original_ buffer to preserve EXIF metadata (which `sharp` strips by default). An early bug ran both on the resized buffer and silently lost all EXIF data — now the two buffers are passed explicitly.

**Null Island GPS filter.** OnePlus phones sometimes write an empty GPS IFD (skeleton, no values) when GPS hasn't locked yet. exifr returns these as `(0, 0)` — the coordinates of Null Island in the Gulf of Guinea, where no construction happens. The stack treats exact `(0, 0)` as "no GPS" rather than "GPS at Null Island."

**DMS-to-decimal fallback for GPS.** Some camera vendors encode GPS in degree-minute-second format that exifr's auto-parsing returns as `NaN`. A fallback converter runs when the primary parse fails.

**Canonical-language invariant.** The verification routes always read from the canonical `milestones[]` array, never from translated `displayMilestones`. Mutating a canonical field to a translated value would break audit reconciliation between the English record and any translated view. Enforced in code with a comment next to the relevant line.

**Pre-flight gas check on Sepolia.** KeeperHub's Web3 Write Contract action hardcodes `maxPriorityFeePerGas` at 0.1 gwei on Sepolia but computes `maxFeePerGas` dynamically from base fee. When Sepolia base fee drops below 0.1 gwei (common during quiet periods), the resulting tx violates EIP-1559's `maxFee` ≥ `priorityFee` invariant and is rejected by ethers v6 inside KH's wrapper before reaching Turnkey to sign — but KH's execution status stays running, so the backend would otherwise burn its full 90s polling timeout. The backend pre-flights every Sepolia operation by reading `block.baseFeePerGas` and refusing to fire the webhook if base fee is below 0.1 gwei. Surfaces in ~200ms with a clear error. Documented in `KEEPERHUB_FEEDBACK.md.`

**Handover-before-transfer ordering.** A project's status records (`status`, `handed_over_to`) must be written to the old subname _before_ the NFT transfers, not after. The PublicResolver re-checks `ownerOf(node)` on every `setText` call, and the MPC's `setApprovalForAll` is granted by the original owner — once the NFT moves, that approval no longer authorises writes for the new owner's subnames. The handover endpoint blocks on the record writes confirming on Sepolia (typical: 12s each, sequential) before the frontend prompts for the transfer signature. If a record write fails, the transfer is aborted with a clear error rather than producing a half-handed-over state.

---

## 7. Security considerations

**Contract scope is minimal by design.** `MilestoneEscrow` does one thing: hold funds and release them on milestone completion. No upgradability, no pausing, no role-based admin, no ability to change the builder address after deployment. Every function has a narrow purpose and a narrow permission surface.

**The agent is a constrained relayer, not a custodian.** Even in the server-wallet fallback path, the `DEPLOYER_PRIVATE_KEY` can only call `completeMilestone()`, which sends funds to the builder address set at deployment. It cannot redirect funds, withdraw escrow, or change the payee. A key compromise is bounded to "attacker approves a milestone early" — which is still bounded to the pre-specified builder address.

**The MPC wallet's ENS authority is scoped to text records.** On Sepolia, the agent has `setApprovalForAll` on the PublicResolver granted by the funder. This authorises writing text records on names the funder owns — nothing more. The MPC cannot transfer subnames, change subname ownership, mint additional subnames under user-owned names, or affect any namespace outside the explicit resolver approval. A compromise of the MPC layer does not put project identity at risk; the worst case is stale or out-of-sync records, which the funder can re-sync by revoking and re-granting approval.

**The canonical record is English (or whichever language the funder wrote in).** Translations are view-only. The agent reads from the canonical spec. A translation can never change what the contract enforces.

**Trust Stack is honest about failure modes.** Each of the four layers has documented failure modes (see §4.4 and `buildLog2.docx`). The stack is not claimed to be foolproof; it's claimed to be harder to beat than single-layer alternatives. The escalation path exists specifically for cases where the stack is uncertain.

**Provenance signals cannot be overridden by a visual check.** If Reality Defender flags an image as AI-generated above 70% probability, Claude Vision is instructed to escalate regardless. This prevents the model from "talking itself into" approving evidence that the provenance stack has already flagged.
