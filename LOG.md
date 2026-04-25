===================== LOG: 24TH 22:33 Got helloworld working on 0G seems to be on problem. I'll call it next and check.

────────────────────────────────────────────────────────────
Deploying HelloZeroG to zgGalileo
────────────────────────────────────────────────────────────
Deployer: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
Balance: 0.003806194143397947 OG

Deploying… tx: 0x83701e1847aaa52184ec5e0ebaa0ae797bb9b7b24203e4f528a802caf726c0ae

✓ Deployed at: 0x94C41246985AE15846b525bEd4171EED0909679e
✓ ChainScan: https://chainscan-galileo.0g.ai/address/0x94C41246985AE15846b525bEd4171EED0909679e
✓ Tx ChainScan: https://chainscan-galileo.0g.ai/tx/0x83701e1847aaa52184ec5e0ebaa0ae797bb9b7b24203e4f528a802caf726c0ae

===================== LOG: 24TH 22:40 HelloWorld interact works fine. I'm going to move onto construct milestone escrow next.

────────────────────────────────────────────────────────────
Interacting with HelloZeroG on zgGalileo
────────────────────────────────────────────────────────────
Address: 0x94C41246985AE15846b525bEd4171EED0909679e

Reading state…
message: "Hello, 0G — Construct is live."
owner: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
deployedAt: 2026-04-24T21:32:01.000Z
ping(): true

Updating message to: "Updated at 2026-04-24T21:40:05.750Z"
tx: 0x3053f7fcd933acd5c0951cd58607f0e45efcf2295dde8fd2564c9d499c591f3b
✓ Confirmed

New on-chain message: "Updated at 2026-04-24T21:40:05.750Z"

ChainScan tx: https://chainscan-galileo.0g.ai/tx/0x3053f7fcd933acd5c0951cd58607f0e45efcf2295dde8fd2564c9d499c591f3b

===================== LOG: 25TH 08:38 test running fine for MilestoneEscrow.

MilestoneEscrow
deployment & constructor validation
✔ deploys with valid parameters and sets all state (48ms)
✔ reverts when names and percentages length mismatch
✔ reverts when there are no milestones
✔ reverts when payee is the zero address
✔ reverts when agent is the zero address
✔ reverts when budget is zero
✔ reverts when percentages do not sum to 100
✔ getRequiredFunding returns budget + 5% agent fee
funding
✔ accepts funding via fund() and marks the escrow funded
✔ reverts when funding is less than budget + agent fee
✔ reverts when funded twice
✔ primes the agent wallet with half the agent fee
✔ holds the other half of the agent fee as gas reserve
✔ allocates milestone amounts proportionally
✔ refunds overpayment to the funder
✔ emits Funded with correct funder, escrow amount, reserve, and primed values
✔ supports funding directly in the constructor
completeMilestone
✔ releases payment to the payee when called by the owner
✔ releases payment when called by the agent
✔ reverts when called by anyone other than owner or agent
✔ reverts on invalid milestone id
✔ reverts when completing a milestone twice
✔ marks the milestone as completed and stores the timestamp
✔ updates totalReleased after each completion
✔ emits MilestoneCompleted with id, amount, and payee
✔ emits EscrowFullyComplete after the last milestone
✔ returns the leftover gas reserve to the owner on full completion
✔ emits ReserveReturned on full completion
✔ isFullyComplete reports true after all milestones complete
agent gas refund
✔ refunds the agent for gas used on a non-final milestone
✔ does NOT refund the agent on the final milestone (reserve already returned to owner)
edge cases
✔ works with a single milestone at 100%
✔ handles rounding by giving the remainder to the last milestone
✔ handles many milestones (10 at 10% each) (43ms)

34 passing (2s)

===================== LOG: 25th 08:50 deploy-escrow is running. I've got it deplying and refunding extra gas.

────────────────────────────────────────────────────────────
Deploying MilestoneEscrow to zgGalileo
────────────────────────────────────────────────────────────
Deployer: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
Balance: 0.501754418139807339 OG

Parameters:
Milestones: 3 0. Foundation poured (30%) 1. Walls and roof complete (40%) 2. Solar panels and rainwater harvesting installed (30%)
Payee: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
Agent: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
StorageHash: pending-storage-integration
Budget: 0.01 OG

Deploying… tx: 0xc236e67304847e07c2f7b57bb699bfa53d2373649e4d2602e643d90fc017aae7

✓ Deployed at: 0x5492A39a3Fc756Dd1083aE995c3fD56576d60F02
✓ ChainScan: https://chainscan-galileo.0g.ai/address/0x5492A39a3Fc756Dd1083aE995c3fD56576d60F02
✓ Tx ChainScan: https://chainscan-galileo.0g.ai/tx/0xc236e67304847e07c2f7b57bb699bfa53d2373649e4d2602e643d90fc017aae7

Required funding: 0.0105 OG
(call fund() with this amount to activate the escrow)

✓ Saved to deployments.json
alexander@Alexanders-MacBook-Pro-2 Construct %

===================== ERROR 25th 08:54 BUG in the complete milestone

────────────────────────────────────────────────────────────
Interacting with MilestoneEscrow on zgGalileo
────────────────────────────────────────────────────────────
Address: 0x5492A39a3Fc756Dd1083aE995c3fD56576d60F02
Caller: 0xdf6cA46F65159658Ac52736CeBD806C16095B078

1. Reading initial state
   owner: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
   agent: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
   payee: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
   budget: 0.01 OG
   funded: false
   milestones: 3
   requiredFunding: 0.0105 OG

   [0] Foundation poured — 30% — completed: false
   [1] Walls and roof complete — 40% — completed: false
   [2] Solar panels and rainwater harvesting installed — 30% — completed: false

2. Funding the escrow
   Balance before: 0.496244746130165413 OG
   tx: 0x3791b7a97ce11c0c2250609c23365ce99aa8695325b48b72d4f12b12f4a06cd3
   ✓ Funded
   Balance after: 0.485194886128765658 OG

3. Post-funding state
   funded: true
   totalFunded: 0.01 OG
   agentPrimed: 0.00025 OG
   agentGasReserve: 0.00025 OG
   escrowBalance: 0.01025 OG

4. Completing milestones
   [0] Foundation poured
   amount: 0.003 OG
   tx: 0x4ebcf781458c5b9d2c8580b9ed850baf18c21deaa22a3929a6d607e530f244c4
   Error: transaction execution reverted (action="sendTransaction", data=null, reason=null, invocation=null, revert=null, transaction={ "data": "", "from": "0xdf6cA46F65159658Ac52736CeBD806C16095B078", "to": "0x5492A39a3Fc756Dd1083aE995c3fD56576d60F02" }, receipt={ "\_type": "TransactionReceipt", "blobGasPrice": null, "blobGasUsed": null, "blockHash": "0xbbc2d41260fa1871a42dc57177ab254418505cf512b879fd9042040754ed5302", "blockNumber": 29691072, "contractAddress": null, "cumulativeGasUsed": "117626", "from": "0xdf6cA46F65159658Ac52736CeBD806C16095B078", "gasPrice": "4000000007", "gasUsed": "117626", "hash": "0x4ebcf781458c5b9d2c8580b9ed850baf18c21deaa22a3929a6d607e530f244c4", "index": 0, "logs": [ ], "logsBloom": "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", "root": null, "status": 0, "to": "0x5492A39a3Fc756Dd1083aE995c3fD56576d60F02" }, code=CALL_EXCEPTION, version=6.13.1)
   at makeError (/Users/alexander/Desktop/MAIN DOCS - PAXMATA/Hack 2026/Construct/node_modules/ethers/src.ts/utils/errors.ts:694:21)
   at assert (/Users/alexander/Desktop/MAIN DOCS - PAXMATA/Hack 2026/Construct/node_modules/ethers/src.ts/utils/errors.ts:715:25)
   at checkReceipt (/Users/alexander/Desktop/MAIN DOCS - PAXMATA/Hack 2026/Construct/node_modules/ethers/src.ts/providers/provider.ts:1585:19)
   at txListener (/Users/alexander/Desktop/MAIN DOCS - PAXMATA/Hack 2026/Construct/node_modules/ethers/src.ts/providers/provider.ts:1635:33)
   at processTicksAndRejections (node:internal/process/task_queues:104:5) {
   code: 'CALL_EXCEPTION',
   action: 'sendTransaction',
   data: null,
   reason: null,
   invocation: null,
   revert: null,
   transaction: {
   to: '0x5492A39a3Fc756Dd1083aE995c3fD56576d60F02',
   from: '0xdf6cA46F65159658Ac52736CeBD806C16095B078',
   data: ''
   },
   receipt: TransactionReceipt {
   provider: HardhatEthersProvider {
   \_hardhatProvider: [LazyInitializationProviderAdapter],
   \_networkName: 'zgGalileo',
   \_blockListeners: [],
   \_transactionHashListeners: Map(0) {},
   \_eventListeners: [],
   \_isHardhatNetworkCached: false,
   \_transactionHashPollingTimeout: undefined
   },
   to: '0x5492A39a3Fc756Dd1083aE995c3fD56576d60F02',
   from: '0xdf6cA46F65159658Ac52736CeBD806C16095B078',
   contractAddress: null,
   hash: '0x4ebcf781458c5b9d2c8580b9ed850baf18c21deaa22a3929a6d607e530f244c4',
   index: 0,
   blockHash: '0xbbc2d41260fa1871a42dc57177ab254418505cf512b879fd9042040754ed5302',
   blockNumber: 29691072,
   logsBloom: '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
   gasUsed: 117626n,
   blobGasUsed: undefined,
   cumulativeGasUsed: 117626n,
   gasPrice: 4000000007n,
   blobGasPrice: undefined,
   type: 2,
   status: 0,
   root: undefined
   },
   shortMessage: 'transaction execution reverted'
   }

===================== testing seems to work, but broadcast tx died

Welcome to Node.js v25.8.1.
Type ".help" for more information.

> const c = await ethers.getContractAt("MilestoneEscrow", "0x5492A39a3Fc756Dd1083aE995c3fD56576d60F02")
> undefined
> await c.completeMilestone.staticCall(0)
> Result(0) []
> await c.payee()
> '0xdf6cA46F65159658Ac52736CeBD806C16095B078'
> await c.owner()
> '0xdf6cA46F65159658Ac52736CeBD806C16095B078'
> await c.agent()
> '0xdf6cA46F65159658Ac52736CeBD806C16095B078'
> await c.getEscrowBalance()
> 10250000000000000n
> const m = await c.getMilestone(0)
> undefined
> m.amount
> 3000000000000000n
> m.completed
> false

===================== FIXED

────────────────────────────────────────────────────────────
Interacting with MilestoneEscrow on zgGalileo
────────────────────────────────────────────────────────────
Address: 0x5492A39a3Fc756Dd1083aE995c3fD56576d60F02
Caller: 0xdf6cA46F65159658Ac52736CeBD806C16095B078

1. Reading initial state
   owner: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
   agent: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
   payee: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
   budget: 0.01 OG
   funded: true
   milestones: 3
   requiredFunding: 0.0105 OG

   [0] Foundation poured — 30% — completed: true
   [1] Walls and roof complete — 40% — completed: true
   [2] Solar panels and rainwater harvesting installed — 30% — completed: true

2. Already funded — skipping

3. Post-funding state
   funded: true
   totalFunded: 0.01 OG
   agentPrimed: 0.00025 OG
   agentGasReserve: 0.0 OG
   escrowBalance: 0.0 OG

4. Completing milestones
   [0] already completed — skipping
   [1] already completed — skipping
   [2] already completed — skipping

5. Final state
   totalReleased: 0.01 OG
   isFullyComplete: true
   escrowBalance: 0.0 OG

ChainScan: https://chainscan-galileo.0g.ai/address/0x5492A39a3Fc756Dd1083aE995c3fD56576d60F02

Caught a Galileo gas estimation quirk: ethers' estimator under-shoots
completeMilestone, real tx reverts with status 0 and no reason. Fixed
by setting explicit gasLimit in the script. Filed mentally as a known
quirk to handle in the frontend later.
