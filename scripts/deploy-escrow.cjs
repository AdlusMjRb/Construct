const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("─".repeat(60));
  console.log(`Deploying MilestoneEscrow to ${network}`);
  console.log("─".repeat(60));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} OG`);
  console.log();

  const milestones = [
    "Foundation poured",
    "Walls and roof complete",
    "Solar panels and rainwater harvesting installed",
  ];
  const percentages = [30, 40, 30];
  const payee = deployer.address;
  const agent = deployer.address;
  const storageHash = "pending-storage-integration";
  const budget = hre.ethers.parseEther("0.01");

  console.log("Parameters:");
  console.log(`  Milestones:  ${milestones.length}`);
  milestones.forEach((m, i) => {
    console.log(`    ${i}. ${m} (${percentages[i]}%)`);
  });
  console.log(`  Payee:       ${payee}`);
  console.log(`  Agent:       ${agent}`);
  console.log(`  StorageHash: ${storageHash}`);
  console.log(`  Budget:      ${hre.ethers.formatEther(budget)} OG`);
  console.log();

  const Escrow = await hre.ethers.getContractFactory("MilestoneEscrow");
  const contract = await Escrow.deploy(
    milestones,
    percentages,
    payee,
    agent,
    storageHash,
    budget,
  );

  console.log(`Deploying… tx: ${contract.deploymentTransaction().hash}`);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction().hash;

  console.log();
  console.log(`✓ Deployed at:  ${address}`);
  console.log(
    `✓ ChainScan:    https://chainscan-galileo.0g.ai/address/${address}`,
  );
  console.log(`✓ Tx ChainScan: https://chainscan-galileo.0g.ai/tx/${txHash}`);
  console.log();
  console.log(
    `Required funding: ${hre.ethers.formatEther(await contract.getRequiredFunding())} OG`,
  );
  console.log(`(call fund() with this amount to activate the escrow)`);
  console.log();

  const deploymentsPath = path.join(__dirname, "..", "deployments.json");
  let deployments = {};
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }
  deployments[network] = deployments[network] || {};
  deployments[network].MilestoneEscrow = {
    address,
    deployer: deployer.address,
    payee,
    agent,
    storageHash,
    budget: budget.toString(),
    milestones,
    percentages,
    txHash,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log(`✓ Saved to deployments.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
