-- LOG: 24TH 22:33 Got helloworld working on 0G seems to be on problem. I'll call it next and check.

────────────────────────────────────────────────────────────
Deploying HelloZeroG to zgGalileo
────────────────────────────────────────────────────────────
Deployer: 0xdf6cA46F65159658Ac52736CeBD806C16095B078
Balance: 0.003806194143397947 OG

Deploying… tx: 0x83701e1847aaa52184ec5e0ebaa0ae797bb9b7b24203e4f528a802caf726c0ae

✓ Deployed at: 0x94C41246985AE15846b525bEd4171EED0909679e
✓ ChainScan: https://chainscan-galileo.0g.ai/address/0x94C41246985AE15846b525bEd4171EED0909679e
✓ Tx ChainScan: https://chainscan-galileo.0g.ai/tx/0x83701e1847aaa52184ec5e0ebaa0ae797bb9b7b24203e4f528a802caf726c0ae

-- LOG: 24TH 22:40 HelloWorld interact works fine. I'm going to move onto construct milestone escrow next.

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

-- LOG: 25TH 08:38 test running fine for MilestoneEscrow.

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

-- LOG:
