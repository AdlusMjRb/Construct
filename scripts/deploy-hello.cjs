const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("─".repeat(60));
  console.log(`Deploying HelloZeroG to ${network}`);
  console.log("─".repeat(60));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} OG`);
  console.log();

  const initialMessage = "Hello, 0G — Construct is live.";

  const HelloZeroG = await hre.ethers.getContractFactory("HelloZeroG");
  const contract = await HelloZeroG.deploy(initialMessage);

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

  const deploymentsPath = path.join(__dirname, "..", "deployments.json");
  let deployments = {};
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }
  deployments[network] = deployments[network] || {};
  deployments[network].HelloZeroG = {
    address,
    deployer: deployer.address,
    txHash,
    initialMessage,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log(`✓ Saved to deployments.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
