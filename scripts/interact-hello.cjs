const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  const deploymentsPath = path.join(__dirname, "..", "deployments.json");

  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("deployments.json not found. Run deploy-hello.cjs first.");
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const address = deployments[network]?.HelloZeroG?.address;

  if (!address) {
    throw new Error(`No HelloZeroG deployment found for network: ${network}`);
  }

  const [signer] = await hre.ethers.getSigners();
  const HelloZeroG = await hre.ethers.getContractFactory("HelloZeroG");
  const contract = HelloZeroG.attach(address);

  console.log("─".repeat(60));
  console.log(`Interacting with HelloZeroG on ${network}`);
  console.log("─".repeat(60));
  console.log(`Address: ${address}`);
  console.log();

  console.log("Reading state…");
  const currentMessage = await contract.message();
  const owner = await contract.owner();
  const deployedAt = await contract.deployedAt();
  const pingResult = await contract.ping();

  console.log(`  message:    "${currentMessage}"`);
  console.log(`  owner:      ${owner}`);
  console.log(
    `  deployedAt: ${new Date(Number(deployedAt) * 1000).toISOString()}`,
  );
  console.log(`  ping():     ${pingResult}`);
  console.log();

  const newMessage = `Updated at ${new Date().toISOString()}`;
  console.log(`Updating message to: "${newMessage}"`);
  const tx = await contract.setMessage(newMessage);
  console.log(`  tx: ${tx.hash}`);
  await tx.wait();
  console.log(`  ✓ Confirmed`);
  console.log();

  const updated = await contract.message();
  console.log(`New on-chain message: "${updated}"`);
  console.log();
  console.log(`ChainScan tx: https://chainscan-galileo.0g.ai/tx/${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
