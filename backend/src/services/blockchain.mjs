import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "../config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ARTIFACT_PATH = join(
  __dirname,
  "../../../artifacts/contracts/MilestoneEscrow.sol/MilestoneEscrow.json",
);

let cachedAbi = null;
function getEscrowAbi() {
  if (cachedAbi) return cachedAbi;
  if (!existsSync(ARTIFACT_PATH)) {
    throw new Error(
      `MilestoneEscrow artifact not found at ${ARTIFACT_PATH}. ` +
        `Run \`npx hardhat compile\` from the project root first.`,
    );
  }
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  cachedAbi = artifact.abi;
  return cachedAbi;
}

let cachedProvider = null;
function getProvider() {
  if (cachedProvider) return cachedProvider;
  cachedProvider = new ethers.JsonRpcProvider(config.network.rpcUrl);
  return cachedProvider;
}

export async function readEscrowState(address) {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  const provider = getProvider();
  const contract = new ethers.Contract(address, getEscrowAbi(), provider);

  const code = await provider.getCode(address);
  if (code === "0x") {
    throw new Error(
      `No contract deployed at ${address} on ${config.network.name}`,
    );
  }

  const [
    owner,
    agent,
    payee,
    storageHash,
    budget,
    totalFunded,
    totalReleased,
    funded,
    agentPrimed,
    agentGasReserve,
    deployedAt,
    milestoneCount,
    requiredFunding,
    isFullyComplete,
    escrowBalance,
  ] = await Promise.all([
    contract.owner(),
    contract.agent(),
    contract.payee(),
    contract.storageHash(),
    contract.budget(),
    contract.totalFunded(),
    contract.totalReleased(),
    contract.funded(),
    contract.agentPrimed(),
    contract.getAgentGasReserve(),
    contract.deployedAt(),
    contract.getMilestoneCount(),
    contract.getRequiredFunding(),
    contract.isFullyComplete(),
    contract.getEscrowBalance(),
  ]);

  const milestones = await Promise.all(
    Array.from({ length: Number(milestoneCount) }, (_, i) =>
      contract.getMilestone(i),
    ),
  );

  return {
    address: ethers.getAddress(address),
    network: {
      name: config.network.name,
      chainId: config.network.chainId,
    },
    owner,
    agent,
    payee,
    storageHash,
    budget: budget.toString(),
    budgetEth: ethers.formatEther(budget),
    totalFunded: totalFunded.toString(),
    totalFundedEth: ethers.formatEther(totalFunded),
    totalReleased: totalReleased.toString(),
    totalReleasedEth: ethers.formatEther(totalReleased),
    funded,
    isFullyComplete,
    agentPrimed: agentPrimed.toString(),
    agentPrimedEth: ethers.formatEther(agentPrimed),
    agentGasReserve: agentGasReserve.toString(),
    agentGasReserveEth: ethers.formatEther(agentGasReserve),
    escrowBalance: escrowBalance.toString(),
    escrowBalanceEth: ethers.formatEther(escrowBalance),
    requiredFunding: requiredFunding.toString(),
    requiredFundingEth: ethers.formatEther(requiredFunding),
    deployedAt: new Date(Number(deployedAt) * 1000).toISOString(),
    milestoneCount: Number(milestoneCount),
    milestones: milestones.map((m, i) => ({
      id: i,
      name: m.name,
      percentage: Number(m.percentage),
      completed: m.completed,
      amount: m.amount.toString(),
      amountEth: ethers.formatEther(m.amount),
      completedAt:
        Number(m.completedAt) === 0
          ? null
          : new Date(Number(m.completedAt) * 1000).toISOString(),
    })),
    explorerUrl: `https://chainscan-galileo.0g.ai/address/${ethers.getAddress(address)}`,
  };
}
