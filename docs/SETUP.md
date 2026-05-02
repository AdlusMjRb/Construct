# Setup Guide

This is the practical "how do I get this running locally" guide for Construct. Covers everything from prerequisites to a fully working local stack: backend, frontend, KeeperHub instance, Turnkey MPC wallet, ENS parent name registered, three workflows configured.

If you just want to run the app against the existing live deployment, skip to the [README](../README.md). This doc is for **developers cloning to extend or reproduce** the build.

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and install Construct](#2-clone-and-install-construct)
3. [Get testnet funds](#3-get-testnet-funds)
4. [Set up Turnkey MPC wallet](#4-set-up-turnkey-mpc-wallet)
5. [Self-host KeeperHub locally](#5-self-host-keeperhub-locally)
6. [Add 0G Galileo to KeeperHub](#6-add-0g-galileo-to-keeperhub)
7. [Connect Turnkey wallet to KeeperHub](#7-connect-turnkey-wallet-to-keeperhub)
8. [Build the three workflows](#8-build-the-three-workflows)
9. [Register the parent ENS name](#9-register-the-parent-ens-name)
10. [Configure environment variables](#10-configure-environment-variables)
11. [Run it](#11-run-it)
12. [Common gotchas](#12-common-gotchas)

---

## 1. Prerequisites

Software:

- **Node.js ≥ 25** (`node --version`)
- **npm** with `--legacy-peer-deps` flag set
- **Docker** (for KeeperHub's Postgres)
- **PostgreSQL client** (`psql` — for the KeeperHub database recovery commands you'll likely need)
- **Git**
- An **Ethereum wallet** browser extension (MetaMask, Rabby, or Frame)

Accounts:

- **Anthropic Console** account with an API key — https://console.anthropic.com
- **Alchemy** account with a Sepolia API key — https://alchemy.com (free tier is fine)
- **WalletConnect Cloud** project ID — https://cloud.walletconnect.com (free)
- **Turnkey** account — https://app.turnkey.com (free)
- **Reality Defender** API key (optional but recommended for the Trust Stack) — https://www.realitydefender.com

Total time to walk through this guide: **~3-4 hours**. Most of that is the KeeperHub setup and the ENS parent registration on Sepolia (60s commit-reveal wait + a couple of confirmations).

---

## 2. Clone and install Construct

```bash
git clone https://github.com/AdlusMjRb/Construct.git
cd Construct

# Backend
cd backend
npm install --legacy-peer-deps

# Frontend
cd ../frontend
npm install --legacy-peer-deps

# Contracts
cd ../contracts
npm install --legacy-peer-deps
```

Don't run anything yet. Continue with the next sections to get the rest of the stack ready.

---

## 3. Get testnet funds

You need testnet OG (for 0G Galileo) and testnet ETH (for Sepolia). Two wallets minimum:

- **Funder wallet** — your main wallet that creates and funds projects. Needs OG for the escrow funding and Sepolia ETH for the resolver approval and NFT transfers.
- **Builder wallet** — receives milestone payments. Needs no funds initially.

For the demo of the continuation loop, you'll also want a **third wallet** to act as the recipient when sending a project.

**Faucets:**

- **0G Galileo OG:** https://faucet.0g.ai (request ~0.1 OG per wallet)
- **Sepolia ETH:** https://sepoliafaucet.com (Alchemy, ~0.5/day) or https://www.pk910.de/ethpow (PoW, slower but reliable)

Tip: request from 2-3 Sepolia faucets in parallel if you need volume. Sepolia faucets are flaky.

---

## 4. Set up Turnkey MPC wallet

Turnkey provides the multi-party-computation wallet that KeeperHub will route transactions through. The wallet's signing key is split across parties — no single party (including Turnkey itself) can produce a valid signature alone.

### 4.1 Create a Turnkey organisation

Go to https://app.turnkey.com → Sign up → Create a new organisation. Free tier is fine for hackathon-scale usage; if you'll be doing heavy testing, upgrade to **pay-as-you-go** for additional signing credits.

### 4.2 Create a wallet

Inside the organisation:

1. **Wallets** → **Create Wallet**
2. Name it (e.g. "Construct MPC")
3. Choose **Ethereum** as the curve
4. Generate the wallet

You'll get a wallet address that looks like `0xFc49AFB213B4284D9Ab5c1175ACE87b65cf440ce`. **Save this address.** You'll need it in multiple places later.

### 4.3 Create an API key

For KeeperHub to talk to Turnkey, it needs API credentials:

1. **API Keys** → **Create API Key**
2. Pick **Server-to-server** (long-lived)
3. Save the **Public Key** and **Private Key** somewhere safe — you'll paste these into KeeperHub's wallet config

### 4.4 Set policy (optional but recommended)

Under **Policies**, you can constrain what the API key is allowed to sign. For the hackathon you can leave it permissive. For production, restrict to the specific contracts and functions Construct uses.

---

## 5. Self-host KeeperHub locally

KeeperHub's hosted product (`app.keeperhub.com`) doesn't yet support 0G Galileo as a target chain. So you'll run a local KeeperHub instance.

### 5.1 Clone KeeperHub

```bash
git clone https://github.com/keeperhub/keeperhub.git
cd keeperhub
```

(URL placeholder — check KeeperHub's actual repo location as it may have moved.)

### 5.2 Start Postgres

KeeperHub uses Postgres. Start it via Docker:

```bash
docker run --name keeperhub-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=keeperhub \
  -p 5432:5432 \
  -d postgres:16
```

### 5.3 Configure KeeperHub `.env`

Copy `.env.example` to `.env` and set:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/keeperhub
PORT=3000
```

Plus any other vars KeeperHub's docs require (auth secret, etc.).

### 5.4 Migrate the database

```bash
npm install --legacy-peer-deps
npm run db:migrate    # or whatever migration command KH ships with
```

### 5.5 Start KeeperHub

```bash
npm run dev
```

Should be running on `http://localhost:3000`. Open it in browser. Sign up for a local account.

---

## 6. Add 0G Galileo to KeeperHub

This is the bit the hosted product didnt support at time of development yet. I add it directly to the local Postgres.

### 6.1 Connect to Postgres

```bash
psql "postgres://postgres:postgres@localhost:5432/keeperhub"
```

### 6.2 Insert the chain

```sql
INSERT INTO chains (id, name, chain_id, rpc_url, native_currency_symbol, native_currency_decimals)
VALUES (
  gen_random_uuid()::text,
  '0G Galileo Testnet',
  16602,
  'https://evmrpc-testnet.0g.ai',
  'OG',
  18
);
```

If `gen_random_uuid()` errors, run `CREATE EXTENSION IF NOT EXISTS pgcrypto;` first.

### 6.3 Insert the explorer config

```sql
INSERT INTO explorer_configs (id, chain_id, name, url)
VALUES (
  gen_random_uuid()::text,
  16602,
  'ChainScan Galileo',
  'https://chainscan-galileo.0g.ai'
);
```

### 6.4 Restart KeeperHub

Hit `Ctrl+C` and run `npm run dev` again. 0G Galileo should now appear in the chain dropdown when creating workflows.

---

## 7. Connect Turnkey wallet to KeeperHub

KeeperHub needs to know about your Turnkey wallet so workflows can route signing through it.

### 7.1 Try via UI first

In KeeperHub: **Wallets** → **Add Wallet** → **Turnkey**. Paste:

- The wallet address from step 4.2
- The Turnkey organisation ID
- The API key public + private from step 4.3

If the UI works cleanly, great. Save and skip to the next section.

### 7.2 If the "Add Wallet" UI is broken (it often is on self-host)

The integrations table sometimes doesn't get populated correctly when adding wallets through the UI on a fresh self-host. If the form submits but nothing appears, or the submit button is missing entirely, fall back to direct DB inserts:

```bash
psql "$DATABASE_URL" -P pager=off -c "SELECT id, email FROM users;"
```

Note your user ID (the one matching the email you signed up with).

```sql
-- Insert the integration row
INSERT INTO integrations (id, user_id, name, type, config)
VALUES (
  gen_random_uuid()::text,
  '<your-user-id-here>',
  'Web3 Wallet',
  'web3',
  '{}'
);
```

Hard-refresh KeeperHub (Cmd+Shift+R). The wallet should now appear in the Web3 Connection picker when you build a workflow.

If still not visible, check `organization_id` mapping. In KH, `integrations` and `para_wallets` (the table where Turnkey wallets are stored despite the name) link via shared `organization_id`:

```sql
-- Find your organization ID
SELECT id, name FROM organization;

-- Update the integration to share the org with the wallet
UPDATE integrations
SET organization_id = '<your-org-id-here>'
WHERE id = '<your-integration-id-here>';
```

### 7.3 Patch gas-strategy for Sepolia

KeeperHub's default Sepolia priority-fee floor is too high. When base fee drops below 0.1 gwei (common on quiet Sepolia periods), transactions get rejected before reaching Turnkey.

In your KH repo, edit `lib/web3/gas-strategy.ts`:

```typescript
// Change this:
const minPriorityFeeGwei = 0.1;

// To this:
const minPriorityFeeGwei = 0.000001;
```

Restart KeeperHub.

---

## 8. Build the three workflows

Construct fires three KeeperHub workflows. Each is a "Write Contract" workflow triggered by a webhook.

### 8.1 Workflow A: `completeMilestone` on 0G

The autonomous milestone release.

- **Trigger:** Webhook
- **Action:** Write Contract
- **Chain:** 0G Galileo (chain 16602)
- **Wallet:** Your Turnkey wallet
- **Contract address:** Pass dynamically from webhook payload (`{{contractAddress}}`)
- **Function:** `completeMilestone(uint256)`
- **Args:** `[{{milestoneId}}]`

Save. Note the webhook URL and bearer token.

### 8.2 Workflow B: `mintSubname` on Sepolia

Mints the project's ENS subname for the funder.

- **Trigger:** Webhook
- **Action:** Write Contract
- **Chain:** Sepolia
- **Wallet:** Your Turnkey wallet
- **Contract address:** `0x0635513f179D50A207757E05759CbD106d7dFcE8` (Sepolia NameWrapper)
- **Function:** `setSubnodeOwner(bytes32,string,address,uint32,uint64)`
- **Args:** `[{{parentNode}}, {{label}}, {{ownerWallet}}, 65537, 18446744073709551615]`

The fuse value `65537` = `PARENT_CANNOT_CONTROL | CANNOT_UNWRAP`. The huge expiry value clamps to parent expiry automatically.

Save. Note the webhook URL.

### 8.3 Workflow C: `setText` on Sepolia

Writes text records to the resolver.

- **Trigger:** Webhook
- **Action:** Write Contract
- **Chain:** Sepolia
- **Wallet:** Your Turnkey wallet
- **Contract address:** `0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5` (Sepolia PublicResolver)
- **Function:** `setText(bytes32,string,string)`
- **Args:** `[{{node}}, {{key}}, {{value}}]`

Save. Note the webhook URL.

You should now have three webhook URLs that look like:

```
http://localhost:3000/api/workflows/<workflow-id>/webhook
```

---

## 9. Register the parent ENS name

The parent name `construct.eth` needs to be registered on Sepolia by your Turnkey wallet, then wrapped, then locked.

If you're forking the project, register a different parent (e.g. `<yourname>-construct.eth`).

### 9.1 Check availability

Use a script or any ENS app pointing at Sepolia to check `<yourname>.eth` is available. https://sepolia.app.ens.domains/ works.

### 9.2 Register from the Turnkey wallet

Easiest path: connect MetaMask to the Turnkey wallet (via Turnkey's MetaMask Snap), open https://sepolia.app.ens.domains, register the name for ≥ 5 years.

### 9.3 Wrap and lock

Once registered, in the ENS UI:

1. **More** → **Wrap Name**. Wrap the ETH2LD into the NameWrapper.
2. **Permissions** → burn `CANNOT_UNWRAP`. **This is irreversible.** Do this after testing other things.

Verify it's locked:

```bash
# Anywhere with cast (foundry) installed
cast call 0x0635513f179D50A207757E05759CbD106d7dFcE8 \
  "getData(uint256)(address,uint32,uint64)" \
  $(cast call 0x0635513f179D50A207757E05759CbD106d7dFcE8 "ownerOf(uint256)(address)" \
     $(cast keccak "construct.eth")) \
  --rpc-url https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

The fuses field should include `CANNOT_UNWRAP` (1).

### 9.4 Compute the parent node hash

```bash
node -e "const { namehash } = require('viem/ens'); console.log(namehash('construct.eth'));"
```

Copy this hash — you'll use it as `{{parentNode}}` in Workflow B.

---

## 10. Configure environment variables

### 10.1 Backend `.env`

In `backend/.env`:

```bash
# Server
PORT=3001

# Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...

# Server wallet (fallback path; also signs 0G Storage uploads)
DEPLOYER_PRIVATE_KEY=0x...

# Reality Defender (optional)
REALITY_DEFENDER_API_KEY=rd_...

# 0G Chain
ZG_RPC_URL=https://evmrpc-testnet.0g.ai

# 0G Storage
ZG_STORAGE_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai

# KeeperHub
KEEPERHUB_AGENT_ADDRESS=0xFc49...               # Turnkey wallet address from §4.2
KEEPERHUB_WEBHOOK_URL=http://localhost:3000/api/workflows/<workflow-A-id>/webhook
KEEPERHUB_MINT_SUBNAME_URL=http://localhost:3000/api/workflows/<workflow-B-id>/webhook
KEEPERHUB_SET_TEXT_URL=http://localhost:3000/api/workflows/<workflow-C-id>/webhook
KEEPERHUB_API_KEY=wfb_...                       # KH webhook bearer token

# Sepolia
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
```

The `DEPLOYER_PRIVATE_KEY` is for the fallback execution path and 0G Storage uploads. It must hold a small OG balance.

### 10.2 Frontend `.env`

In `frontend/.env`:

```bash
VITE_API_BASE_URL=/api
VITE_WALLETCONNECT_PROJECT_ID=<your-wc-project-id>
```

### 10.3 If you forked with a different parent name

Update `backend/src/keeperhub/ens.mjs`:

```javascript
const PARENT_NAME = "<yourname>.eth";
const PARENT_NODE = "<the namehash you computed in §9.4>";
```

---

## 11. Run it

Three terminals.

**Terminal 1 — KeeperHub:**

```bash
cd <keeperhub-repo>
npm run dev
```

**Terminal 2 — Construct backend:**

```bash
cd Construct/backend
npm run dev
```

You should see:

```
────────────────────────────────────────────────────────────
  Construct Backend
────────────────────────────────────────────────────────────
  Listening on http://localhost:3001
  Network:     0G Galileo Testnet (chainId 16602)
  RPC:         https://evmrpc-testnet.0g.ai
────────────────────────────────────────────────────────────
```

**Terminal 3 — Construct frontend:**

```bash
cd Construct/frontend
npm run dev
```

Vite serves on `http://localhost:5173`. Open in browser, connect your funder wallet, walk through the three shutters: Describe → Review → Verify.

If the deploy succeeds, the subname mint succeeds, and a milestone release triggers a `setText` confirmation on Sepolia, the full stack is wired correctly.

---

## 12. Common gotchas

A non-exhaustive list of things that have bitten people. The full set of resilience patterns is documented in [`ARCHITECTURE.md` §6](./ARCHITECTURE.md#6-resilience-patterns).

**0G Storage occasionally reverts.** The SDK sometimes hits `require(false)` on the flow contract. Construct retries twice. If it persistently fails, set `SKIP_STORAGE=true` in `.env` to bypass uploads (not for production — you lose the audit trail).

**0G chain ID is 16602, NOT 16601.** Some old docs and community references list the wrong chain ID. Construct enforces the correct value.

**KeeperHub status endpoint returns 500.** Self-hosted KH's `GET /api/executions/:id` is broken. Construct ignores it entirely and polls 0G Chain directly to detect completion. The blockchain is the source of truth.

**Sepolia base fee dropping below 0.1 gwei.** KeeperHub's default priority-fee floor causes silent rejections. Patch `lib/web3/gas-strategy.ts` (covered in §7.3). Construct also pre-flights every Sepolia operation via `block.baseFeePerGas` and refuses to fire if base fee is too low.

**Resolver approval is per-resolver, not per-name or per-wrapper.** Granting `setApprovalForAll` on the NameWrapper doesn't let the MPC write text records — the resolver maintains its own approval mapping. Construct caches the per-(funder, MPC) approval status in `localStorage` so subsequent projects on the same wallet skip the prompt.

**Handover writes must happen BEFORE NFT transfer.** When the project NFT moves to a new owner, the resolver no longer accepts MPC writes (the new owner hasn't granted resolver approval yet). Construct seals the `status: handed_over` and `handed_over_to` records first, then signs the transfer.

**WalletConnect stale session loop.** Hot-reloading the frontend mid-session can corrupt WalletConnect storage. If you see infinite alternating "request() failed" and "Missing or invalid" errors, run this in browser console:

```javascript
Object.keys(localStorage)
  .filter((k) => /wc|walletconnect|wagmi/i.test(k))
  .forEach((k) => localStorage.removeItem(k));
indexedDB
  .databases()
  .then((dbs) => dbs.forEach((db) => indexedDB.deleteDatabase(db.name)));
```

Then close the tab entirely and reopen.

**Single-milestone projects hit a known refund-ordering bug.** Use ≥ 2 milestones for testing. Documented as a known issue; fix is post-hackathon.

**The `agent` baked into the contract must match the wallet KH is signing with.** If `completeMilestone` reverts with "Not owner or agent," check that `KEEPERHUB_AGENT_ADDRESS` in `backend/.env` matches the actual Turnkey wallet address KH uses. Drift here is the #1 cause of agent-release failures.

---

_Setup feedback welcome — issues + PRs to https://github.com/AdlusMjRb/Construct._
