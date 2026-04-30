# KeeperHub — Builder Feedback

_Submitted for the KeeperHub Builder Feedback Bounty, ETHGlobal Open Agents 2026._

_Project: [Construct](../README.md) — an autonomous construction escrow agent. KeeperHub is our execution layer: an MPC wallet signs milestone release transactions on 0G Galileo and ENS subname operations on Sepolia, so no private key sits on any Paxmata-controlled server. Written up in detail in [ARCHITECTURE.md](./ARCHITECTURE.md)._

---

## Summary

I ran KeeperHub self-hosted on macOS against a local PostgreSQL 16 + Redis stack, with Turnkey as the MPC provider. Production-shape integration across two chains:

- **0G Galileo** (chain ID 16602) — added as a custom chain via SQL. Webhook-triggered `completeMilestone` workflow.
- **Sepolia** (chain ID 11155111) — used the seeded chain row, swapped the RPC to Alchemy. Webhook-triggered `setSubnodeOwner` workflow on ENS NameWrapper for project-NFT minting.

Same Turnkey MPC wallet (`0xFc49…40ce`) signs both. No backend-held key touches funds or naming records.

**Total integration time: ~16 hours across 4 sessions.** Of that, roughly 8 hours were spent working around issues that better documentation or small bug fixes would have eliminated. That's the delta I'm writing up here, not to criticise, but because the bounty explicitly asks for it and because future hackers hitting the same walls would benefit from these being fixed before the window opens.

The structure below follows the four bounty categories in order: documentation gaps, reproducible bugs, UX/UI friction, and feature requests. Severity tags (🔴 blocker, 🟠 high, 🟡 medium, 🟢 low) indicate the time-cost of working around each item.

---

## What worked well

Brief, because balance helps triage, not because I'm padding.

- **The MPC-wallet execution model is the right primitive.** The `_agent` address in our Solidity contract is configurable at deployment, and dropping KeeperHub's Turnkey-managed address into that role required zero Solidity changes. Once the integration worked, it _worked_ — the architecture is clean and the abstractions are at the right level.
- **Webhook triggers are the right invocation model for agent-authored payments.** Firing a workflow by POSTing JSON to a URL is exactly what an AI backend needs.
- **Multi-chain signing from one MPC wallet works seamlessly.** Going from one chain (0G) to two (0G + Sepolia) was a new workflow + a one-row chain-config update. Same wallet, same auth, same webhook pattern. The abstraction held up.
- **The workflow editor, once configured, is pleasant to use.** Visual DAG + structured nodes beats writing custom executor code.
- **Variable field colour-coding (blue = resolved, red = literal) is a great affordance** when you know to look for it. Caught a real bug for me on Day 7 (see §1.7).
- **Turnkey under the hood is unobtrusive.** Once credentials were in place I did not think about Turnkey again, which is the right outcome.
- **Discord responsiveness was excellent.** Confirmations on 0G Galileo hosted support came back same-day, though would have been nice to get hosted for the hack.

The remainder of this document is the stuff that cost us time.

---

## 1. Documentation gaps

The biggest category by impact. Most of these are fixable in a docs PR in under an hour each.

### 1.1 `.env.example` is missing five required env vars 🔴

Running a fresh self-host with the provided `.env.example` crashes at runtime because the following environment variables are required but not listed:

| Variable                     | What it's for                                | How it surfaced                      |
| ---------------------------- | -------------------------------------------- | ------------------------------------ |
| `DATABASE_URL`               | PostgreSQL connection string                 | Prisma/Drizzle throws on first query |
| `BETTER_AUTH_SECRET`         | `better-auth` session signing secret         | 500 on first auth call               |
| `BETTER_AUTH_URL`            | Base URL used by `better-auth` for callbacks | Auth callbacks fail silently         |
| `INTEGRATION_ENCRYPTION_KEY` | Encrypts integration credentials at rest     | 500 when creating an integration     |
| `WALLET_ENCRYPTION_KEY`      | Encrypts wallet key material at rest         | 500 when creating a wallet           |

**Impact:** 🔴 This is a blocker. Each variable surfaces as a separate runtime crash in a different code path, so you don't discover all of them at once. You fix one, hit the next, fix that, hit the next. The cumulative cost is roughly 30–45 minutes of "what's broken _now_" debugging for a new self-host.

---

### 1.2 Webhook template format is undocumented 🔴

This was the single most expensive documentation gap I hit — **~90 minutes of debugging for what turned out to be a format string.**

The Write Contract node uses Mustache-style templates to reference webhook payload fields. The format is:

```
{{@<nodeId>:<TriggerName>.<path>}}
```

Three things were non-obvious and cost us time to discover:

1. **`<nodeId>` is not the string `"trigger"`.** It has to be the Webhook node's internal ID, which you have to look up in the workflow's Code-tab JSON (e.g. `mwa1NXclzq0zJ5t3nZeAq`). I used `{{@trigger:Trigger.body.contractAddress}}` initially, which silently resolved to empty string.
2. **The payload is exposed at `.data.`, not `.body.`**, despite `.body.` being what the MCP schema example in the docs suggested.
3. **Field types in the Request Schema matter.** If the schema declares `milestoneId` as `String` but the contract expects `uint256`, the resolved value gets wrapped in quotes and downstream validation fails with a confusing "invalid BigNumberish string" error.

The correct form for our first workflow ended up being:

```
{{@mwa1NXclzq0zJ5t3nZeAq:Trigger.data.milestoneId}}
```

…with `milestoneId` declared as `Number` in the Request Schema.

**Impact:** 🔴 A full afternoon of debugging. When templates silently resolve to empty strings, the error surfaces downstream as "Invalid contract address" at the Write Contract node, which sent us looking in the wrong place (the contract, not the template).

---

### 1.3 Variable namespace prefix follows the trigger node's display name, not a fixed string 🔴

Discovered Day 7. Our first workflow's webhook node was (auto-?)named `Trigger`, so paths were `Trigger.data.x`. When I built a second workflow whose webhook node was named `Webhook`, the same paths silently failed — `{{@<nodeId>:Trigger.data.parentNode}}` resolved to literal text because the namespace had to be `Webhook.data.parentNode` (matching the new node's name).

Failure mode: the literal string `"Webhook.data.owner"` got passed to the contract, ethers tried to interpret it as an ENS name, and we got `UNCONFIGURED_NAME (value="Webhook.data.owner", code=UNCONFIGURED_NAME)`. The error pointed at ethers, not at the workflow.

This sits upstream of §1.2: even when you know the template syntax, you can still get the namespace wrong. The picker (`@` shortcut, see §1.7) does show the right namespace if you use it, so the practical fix is "always use the picker, never type" — but that's a workaround, not documentation.

**Suggested fix:** either standardise the namespace to `Trigger.*` regardless of node rename, or surface the actual prefix in the dropdown labels.

**Impact:** 🔴 ~30 minutes once we'd already worked through §1.2. Compounds nastily because the syntax _looks_ right.

---

### 1.4 Webhook authorisation is required on self-host but not in quick-start 🟡

Webhooks are conventionally unauthenticated HTTP POSTs in most workflow platforms. KeeperHub self-hosted requires an `Authorisation: Bearer <kh_...>` header on every webhook trigger, which is sensible (anyone who knew the URL could otherwise fire payouts) but is not mentioned in the self-host quick-start.

I discovered this by getting 401 on our first webhook call. The API key is created in a different part of the UI (settings) from where the webhook URL is shown (workflow editor), which compounded the confusion.

There's also a follow-on shell ergonomics issue: if you store the key in a `.env` file and fire the webhook from a fresh terminal with `curl -H "Authorization: Bearer $KH_API_KEY"`, the variable expands to empty unless you've sourced the env file with `set -a; source .env; set +a` first. KeeperHub returns `{"error":"Invalid API key format"}` which is the right error but doesn't hint at the (very common) cause.

**Impact:** 🟡 ~15 minutes for the missing-doc, ~5 minutes every time a new dev forgets to source.

---

### 1.5 `organisationWallets` is an alias for `para_wallets`, nowhere documented 🟡

In `lib/db/schema.ts`, references to `organisationWallets` don't resolve against the main schema — the symbol is imported and used but never defined. The real definition lives in `lib/db/schema-extensions.ts`, where `organisationWallets` is aliased to the existing `para_wallets` table.

**Impact:** 🟡 ~20 minutes spent wondering why there was a broken symbol before realising it was aliased elsewhere.

---

### 1.6 Seeded testnet RPCs use unreliable public endpoints 🟠

The Sepolia row seeded into the `chains` table on a fresh self-host points at `https://ethereum-sepolia-rpc.publicnode.com` for both primary and fallback RPC. That endpoint throttles aggressively and has documented reliability issues (Safe Wallet team filed a Jan 2026 issue about ENS reverse-lookup failures via similar public RPCs).

Symptoms in our case: webhook executions succeeded but emitted `Contract call failed: RPC failed on both endpoints` with no obvious clue that the endpoint, not the contract, was the problem. Swapping to Alchemy via `UPDATE chains SET default_primary_rpc = ... WHERE chain_id = 11155111;` resolved it.

**Impact:** 🟠 ~20 minutes of mistakenly debugging the contract call before realising the RPC was the issue.

---

### 1.7 Variable picker only opens on `@`, not `{` 🟡

Templates use `{{...}}` syntax (per §1.2), so typing `{` is the intuitive way to invoke the variable autocomplete. It doesn't. Only `@` does, with no on-field hint that this is the case.

Failure mode: type `{`, get nothing, assume picker isn't available, fall back to typing raw paths (which then trips §1.3). Took us a real iteration to figure out.

**Impact:** 🟡 ~5 minutes on its own, but compounds with §1.3 because typing raw paths is the failure mode it pushes you toward.

---

## 2. Reproducible bugs

With reproduction steps, per bounty criteria.

### 2.1 `GET /api/executions/:id` returns 500 for all executions on self-host 🔴

**Repro:**

1. Clone `keeperhub/keeperhub`, set up per the self-host README.
2. Create a webhook-triggered workflow with any action node.
3. Fire the webhook. It returns `{executionId, status: "running"}`.
4. `GET /api/executions/<executionId>` with Bearer auth.
5. Response: `500 Internal Server Error` — for both successful and failed runs.

The workflows themselves execute correctly. The status endpoint just can't read its own state. Verified the workflow succeeded by confirming the on-chain transaction it produced.

**Impact:** 🔴 Blocker for any integration that needs to know when a workflow completed. I worked around it by polling the target blockchain for state changes (see ARCHITECTURE.md §7), but that only works when the workflow's effect is observable on-chain. A workflow that writes to a DB or fires a notification couldn't be polled for in the same way.

---

### 2.2 Self-hosted wallet creation doesn't populate the `integrations` table 🟠

**Repro:**

1. Fresh self-host with Turnkey credentials set.
2. Go to **Wallets → Create wallet**, create a new Turnkey wallet.
3. Verify the wallet appears in `para_wallets` — it does.
4. Open the workflow editor, add a Write Contract node, open the Web3 Connection picker.
5. **The picker is empty.** No wallets listed, even though one was just created.
6. `SELECT * FROM integrations` — empty.

On hosted KeeperHub, wallet creation writes to **both** `para_wallets` **and** `integrations` in a single transaction. On self-host, it only writes to `para_wallets`, leaving the Web3 Connection picker blank because the picker reads from `integrations`.

**Workaround:**

```bash
curl -X POST http://localhost:3000/api/integrations \
  -H "Authorisation: Bearer $KH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "web3", "config": {}}'
```

That manually creates the missing row. Wallet then appears in the picker.

**Impact:** 🟠 ~30 minutes of confusion before finding the schema extension file and understanding the two-row write was dropped on self-host. A first-time user could easily conclude their wallet creation failed and redo it multiple times.

---

### 2.3 `functionArgs` double-wraps template strings 🟡

**Repro:**

1. In a Write Contract node, add the function arg template as `["{{@<nodeId>:Trigger.data.milestoneId}}"]` — i.e. wrapping the template in square brackets and quotes because the function takes a single uint256.
2. Fire the webhook with `{"milestoneId": 0}` in the body.
3. Runtime error: `invalid BigNumberish string: Cannot convert ["0"] to a BigInt`

The UI wraps the field content in an array for transport, which produces `["[\"0\"]"]` at the contract call — the raw template is correct but the wrapping is double-applied.

**Workaround:** Provide the bare template without brackets or quotes:

```
{{@<nodeId>:Trigger.data.milestoneId}}
```

The UI handles the array wrapping for you.

**Impact:** 🟡 ~15 minutes. The intuitive thing is to wrap the template to match the array-type field, and the failure mode was a confusing error about BigInt conversion at the ethers layer, not a template error at the workflow layer.

---

### 2.4 `uint64` schema fields overflow when typed as Number 🟡

**Repro:**

1. Create a Write Contract workflow targeting any function with a `uint64` parameter.
2. In the Request Schema, declare the corresponding field as type `Number`.
3. Send a webhook payload with the value `18446744073709551615` (max uint64) — common case for ENS subname expiry, which clamps to parent expiry anyway.
4. The value silently round-trips through JS `Number`, losing precision (`9007199254740992` is the JS Number ceiling).

**Workaround:** declare the schema field as `String`. KeeperHub passes the string straight through to the contract as `uint64` correctly. Verified via successful `setSubnodeOwner` calls on Sepolia NameWrapper.

**Impact:** 🟡 ~10 minutes once we tracked it down. Could be hours if the precision loss doesn't immediately revert (e.g. for smaller-but-still-overflowing values).

### 2.5 Sepolia Write Contract action hardcodes priority fee at 0.1 gwei 🔴

**Repro:**

1. Create a Write Contract workflow targeting any Sepolia contract.
2. Wait for Sepolia base fee to drop below 0.1 gwei (common during quiet periods — currently sits at 0.005 gwei).
3. Fire the webhook.
4. KH execution shows status `running` indefinitely. Tx never appears on-chain.
5. The signing request never reaches Turnkey — no entry in Turnkey's Activities log for the failed run, confirming the tx is rejected inside KH's ethers wrapper before it leaves the action.

**Diagnosis:**

KH's Web3 Write Contract action hardcodes `maxPriorityFeePerGas: 100000000` (0.1 gwei) on Sepolia, but computes `maxFeePerGas` dynamically from current base fee. When base fee is below 0.1 gwei, the resulting tx violates EIP-1559's `maxFee ≥ priorityFee` invariant. ethers v6 rejects with `BAD_DATA: priorityFee cannot be more than maxFee` inside the action. The KH execution status doesn't reflect this — it stays `running`.

Confirmed RPC-side: `eth_maxPriorityFeePerGas` from Alchemy returns 0.001 gwei under current conditions, but KH still uses 0.1. The 0.1 gwei is internal to KH, not RPC-derived.

Verified by inspecting Turnkey's signed-transaction history: a successful Sepolia mint at 12:29 PM (when base fee was ~5 gwei) shows `max_priority_fee_per_gas: 100000000` regardless. Priority fee is fixed, max fee tracks base fee.

**Workaround:**

Pre-flight gate in our backend that reads Sepolia base fee from a separate provider and refuses to fire the KH webhook if base fee < 0.1 gwei. Surfaces a clear error in ~200ms instead of waiting through the polling timeout.

**Impact:** 🔴 Currently blocking all our Sepolia operations during quiet network periods. No way to unstick from KH side as a self-hoster — have to wait for organic Sepolia activity to bump base fee. Will hit any team using KH on a low-base-fee testnet.

---

## 3. UX / UI friction

### 3.1 Email OTP on local instance with no SMTP configured 🟠

The auth flow sends an OTP via email. On local (no SMTP server configured), those emails never arrive, so you can't log in to a freshly-set-up self-host without running:

```sql
SELECT value, created_at FROM verifications
  WHERE identifier = '<your-email>'
  ORDER BY created_at DESC LIMIT 1;
```

…and pasting the token into the browser. Clunky, and a DB query shouldn't be the auth path for a developer's first session.

**Impact:** 🟠 ~15 minutes every time a new developer joins, and every time you reset local state. Cumulatively painful.

---

### 3.2 Missing env vars crash at first use, not at startup 🟠

Related to §1.1. The five missing env vars each surface as a runtime 500 on the first code path that reaches them, rather than as a startup validation error. So a self-host deployment _looks_ like it started successfully, right up until a user tries to do something.

**Impact:** 🟠 Compounds §1.1. If the app had refused to start with "Missing required env vars: DATABASE_URL, BETTER_AUTH_SECRET, …" the whole class of missing-var errors would collapse into one discovery instead of five sequential ones.

---

### 3.3 Template resolution failures surface as downstream errors 🟠

Covered in §1.2 and §1.3, but worth calling out separately as a UX issue: when a template resolves to empty string OR to literal text (the §1.3 case), the Write Contract node doesn't fail with "unresolved template." It passes the bad value through, and then fails downstream with domain errors like "Invalid contract address" or "UNCONFIGURED_NAME from ethers." The error points the user at the wrong layer every time.

The variable-field colour coding (blue for resolved, red for literal) DOES catch this if you notice it — but a hard error at workflow-save time would catch it for everyone.

---

### 3.4 Workflow editor Web3 Connection picker fails silently 🟡

Covered in §2.2 — when the `integrations` row is missing, the Web3 Connection picker appears empty with no error or hint. A "no wallets found — create one here" placeholder would make the failure legible.

---

### 3.5 The "Run" button in the workflow editor isn't useful for webhook-triggered workflows 🟡

Hitting "Run" on a webhook workflow fires it with no payload, which means every templated function arg resolves to literal text (`"Trigger.data.owner"` etc.) and the call reverts. The error this produces (`UNCONFIGURED_NAME` from ethers, see §1.3) is identical to the error a real misconfigured workflow produces, so there's no way to tell from the failure alone whether your workflow is broken or you just hit the wrong button.

**Impact:** 🟢 ~5 minutes of "wait is my workflow broken or did I misuse the button?"

---

## 4. Feature requests

Things that would have made our integration meaningfully easier.

### 4.1 Native 0G Galileo support on hosted KeeperHub

0G is a co-sponsor of this hackathon. I could not use hosted KeeperHub because 0G Galileo (chain ID 16602) isn't a supported target on `app.keeperhub.com`. The fix on self-host was a two-line SQL INSERT into `chains` and `explorer_configs`. Presumably the hosted-side fix is similarly small.

I went through the full self-host path because I needed KeeperHub working on 0G for the bounty. Other teams in this exact hackathon, targeting the 0G partner prize _and_ the KeeperHub prize, will hit the same wall.

### 4.2 Self-serve chain registration

More generally: self-hosters shouldn't have to run SQL INSERTs to register a chain. A UI or CLI for "add a custom EVM chain (RPC URL, chain ID, explorer URL, native symbol)" would be a clean primitive. Teams would stop asking you to add their L2s. Doubly true now we know the seeded testnet RPCs are unreliable (§1.6) — even users on supported chains end up needing the row-edit path.

### 4.3 Dev mode for local development

Covered in §3.1 and §3.2. A single `KEEPERHUB_DEV_MODE=true` flag that: skips email verification, auto-creates the missing `integrations` row on wallet creation, logs OTPs to stdout, and relaxes webhook auth for localhost. Optional but reduces the first-run cliff significantly.

### 4.4 Template linter / save-time validator

Covered in §1.2, §1.3, §2.3, and §3.3 — this is the single biggest cluster of issues in the doc. At workflow-save time, validate that:

- every `{{@<nodeId>:…}}` template references a real node ID
- the namespace prefix matches that node's display name
- the path exists in the schema
- the template isn't double-wrapped
- schema field types match the function ABI types (warn on `Number` for `uint64+`)

Produce warnings in the editor before the workflow is ever fired. Most of §1 and §2 of this doc would not have happened if this existed.

### 4.5 Surface the variable field colour coding in docs

The blue-vs-red colouring of resolved-vs-literal variable references is the single most useful debugging affordance in the editor, and it's undocumented. A one-paragraph "if your template is red, the picker didn't recognise it — type `@` and pick from the dropdown" in the workflow-editor docs would catch most of the §1.3 / §3.3 failure mode.

### 4.6 Multi-chain wallet visibility in the connection picker

Now that we're using one MPC wallet across two chains (0G + Sepolia), the workflow editor's connection picker shows the wallet as a single entry without indicating which chains it has gas on, has been used on, or has known issues with. A small "active on: 0G, Sepolia" badge would help when scaling to more chains.

---

## Closing

KeeperHub is a genuinely useful execution primitive and the MPC-wallet-as-agent pattern solves a regulatory problem that blocks most autonomous-payment projects in UK/EU.

I'd use it again.

Thanks for building this. Thanks for running the bounty.

**Alexander Burge**
Founder & CEO, Paxmata Ltd
Construct — ETHGlobal Open Agents 2026
