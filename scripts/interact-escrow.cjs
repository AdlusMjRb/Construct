const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  const deploymentsPath = path.join(__dirname, "..", "deployments.json");

  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("deployments.json not found. Run deploy-escrow.cjs first.");
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const deployment = deployments[network]?.MilestoneEscrow;

  if (!deployment) {
    throw new Error(`No MilestoneEscrow deployment for network: ${network}`);
  }

  const { address } = deployment;
  const [signer] = await hre.ethers.getSigners();
  const contract = await hre.ethers.getContractAt("MilestoneEscrow", address);

  console.log("─".repeat(60));
  console.log(`Interacting with MilestoneEscrow on ${network}`);
  console.log("─".repeat(60));
  console.log(`Address:      ${address}`);
  console.log(`Caller:       ${signer.address}`);
  console.log();

  console.log("1. Reading initial state");
  const owner = await contract.owner();
  const agent = await contract.agent();
  const payee = await contract.payee();
  const budget = await contract.budget();
  const funded = await contract.funded();
  const milestoneCount = await contract.getMilestoneCount();
  const required = await contract.getRequiredFunding();

  console.log(`   owner:           ${owner}`);
  console.log(`   agent:           ${agent}`);
  console.log(`   payee:           ${payee}`);
  console.log(`   budget:          ${hre.ethers.formatEther(budget)} OG`);
  console.log(`   funded:          ${funded}`);
  console.log(`   milestones:      ${milestoneCount}`);
  console.log(`   requiredFunding: ${hre.ethers.formatEther(required)} OG`);
  console.log();

  for (let i = 0; i < milestoneCount; i++) {
    const m = await contract.getMilestone(i);
    console.log(
      `   [${i}] ${m.name} — ${m.percentage}% — completed: ${m.completed}`,
    );
  }
  console.log();

  if (!funded) {
    console.log("2. Funding the escrow");
    const balanceBefore = await hre.ethers.provider.getBalance(signer.address);
    console.log(
      `   Balance before: ${hre.ethers.formatEther(balanceBefore)} OG`,
    );

    const fundTx = await contract.fund({ value: required });
    console.log(`   tx: ${fundTx.hash}`);
    await fundTx.wait();
    console.log(`   ✓ Funded`);

    const balanceAfter = await hre.ethers.provider.getBalance(signer.address);
    console.log(
      `   Balance after:  ${hre.ethers.formatEther(balanceAfter)} OG`,
    );
    console.log();
  } else {
    console.log("2. Already funded — skipping");
    console.log();
  }

  console.log("3. Post-funding state");
  console.log(`   funded:          ${await contract.funded()}`);
  console.log(
    `   totalFunded:     ${hre.ethers.formatEther(await contract.totalFunded())} OG`,
  );
  console.log(
    `   agentPrimed:     ${hre.ethers.formatEther(await contract.agentPrimed())} OG`,
  );
  console.log(
    `   agentGasReserve: ${hre.ethers.formatEther(await contract.getAgentGasReserve())} OG`,
  );
  console.log(
    `   escrowBalance:   ${hre.ethers.formatEther(await contract.getEscrowBalance())} OG`,
  );
  console.log();

  console.log("4. Completing milestones");
  for (let i = 0; i < milestoneCount; i++) {
    const m = await contract.getMilestone(i);
    if (m.completed) {
      console.log(`   [${i}] already completed — skipping`);
      continue;
    }

    console.log(`   [${i}] ${m.name}`);
    console.log(`        amount: ${hre.ethers.formatEther(m.amount)} OG`);
    const tx = await contract.completeMilestone(i, { gasLimit: 500000 });
    console.log(`        tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(
      `        ✓ Confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`,
    );
  }
  console.log();

  console.log("5. Final state");
  console.log(
    `   totalReleased:  ${hre.ethers.formatEther(await contract.totalReleased())} OG`,
  );
  console.log(`   isFullyComplete: ${await contract.isFullyComplete()}`);
  console.log(
    `   escrowBalance:  ${hre.ethers.formatEther(await contract.getEscrowBalance())} OG`,
  );
  console.log();
  console.log(`ChainScan: https://chainscan-galileo.0g.ai/address/${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
