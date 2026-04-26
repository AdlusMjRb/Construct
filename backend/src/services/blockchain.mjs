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

const AGENT_FEE_BPS = 500n;

const COMPLETE_GAS_LIMIT = 500_000n;

let cachedArtifact = null;
function getEscrowArtifact() {
  if (cachedArtifact) return cachedArtifact;
  if (!existsSync(ARTIFACT_PATH)) {
    throw new Error(
      `MilestoneEscrow artifact not found at ${ARTIFACT_PATH}. ` +
        `Run \`npx hardhat compile\` from the project root first.`,
    );
  }
  cachedArtifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  return cachedArtifact;
}

function getEscrowAbi() {
  return getEscrowArtifact().abi;
}

function getEscrowBytecode() {
  return getEscrowArtifact().bytecode;
}

let cachedProvider = null;
function getProvider() {
  if (cachedProvider) return cachedProvider;
  cachedProvider = new ethers.JsonRpcProvider(config.network.rpcUrl);
  return cachedProvider;
}

let cachedSigner = null;
function getSigner() {
  if (cachedSigner) return cachedSigner;
  if (!config.privateKey) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY is not set in .env — write actions require a signer.",
    );
  }
  cachedSigner = new ethers.Wallet(config.privateKey, getProvider());
  return cachedSigner;
}

export function getServerAddress() {
  return getSigner().address;
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
    network: { name: config.network.name, chainId: config.network.chainId },
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

function calculateRequiredValue(budgetWei) {
  const fee = (budgetWei * AGENT_FEE_BPS) / 10_000n;
  return budgetWei + fee;
}

function validateDeployInput(input) {
  const { milestones, percentages, payee, agent, storageHash, budget } = input;

  if (!Array.isArray(milestones) || milestones.length === 0) {
    throw new Error("milestones must be a non-empty array");
  }
  if (!milestones.every((m) => typeof m === "string" && m.length > 0)) {
    throw new Error("milestones must all be non-empty strings");
  }
  if (!Array.isArray(percentages) || percentages.length !== milestones.length) {
    throw new Error(
      "percentages must be an array of the same length as milestones",
    );
  }
  const sum = percentages.reduce((acc, p) => acc + Number(p), 0);
  if (sum !== 100) {
    throw new Error(`percentages must sum to 100 (got ${sum})`);
  }
  if (!ethers.isAddress(payee)) {
    throw new Error(`payee is not a valid address: ${payee}`);
  }
  if (agent !== undefined && !ethers.isAddress(agent)) {
    throw new Error(`agent is not a valid address: ${agent}`);
  }
  if (typeof storageHash !== "string" || storageHash.length === 0) {
    throw new Error("storageHash must be a non-empty string");
  }
  if (!storageHash.startsWith("0x") || storageHash.length < 10) {
    console.warn(
      `   ⚠️  storageHash "${storageHash}" doesn't look like a 0G Storage root — ` +
        `expected a 0x-prefixed hex hash from /api/projects/generate`,
    );
  }
  if (budget === undefined || budget === null || Number(budget) <= 0) {
    throw new Error("budget must be a positive number (in OG)");
  }
}

export async function deployEscrow(input) {
  validateDeployInput(input);

  const {
    milestones,
    percentages,
    payee,
    storageHash,
    budget,
    fund = true,
  } = input;

  const agent = input.agent ?? getServerAddress();

  const budgetWei = ethers.parseEther(String(budget));
  const value = fund ? calculateRequiredValue(budgetWei) : 0n;

  const factory = new ethers.ContractFactory(
    getEscrowAbi(),
    getEscrowBytecode(),
    getSigner(),
  );

  const contract = await factory.deploy(
    milestones,
    percentages.map((p) => Number(p)),
    payee,
    agent,
    storageHash,
    budgetWei,
    { value },
  );

  const receipt = await contract.deploymentTransaction().wait();
  const address = ethers.getAddress(await contract.getAddress());

  return {
    ok: true,
    address,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    funded: fund,
    budget: budgetWei.toString(),
    budgetEth: ethers.formatEther(budgetWei),
    valueSent: value.toString(),
    valueSentEth: ethers.formatEther(value),
    agent,
    payee,
    explorerUrl: `https://chainscan-galileo.0g.ai/address/${address}`,
    txExplorerUrl: `https://chainscan-galileo.0g.ai/tx/${receipt.hash}`,
  };
}

export async function fundEscrow(address) {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  const provider = getProvider();
  const code = await provider.getCode(address);
  if (code === "0x") {
    throw new Error(`No contract deployed at ${address}`);
  }

  const contract = new ethers.Contract(address, getEscrowAbi(), getSigner());

  const alreadyFunded = await contract.funded();
  if (alreadyFunded) {
    throw new Error("Escrow is already funded — fund() is one-shot");
  }

  const required = await contract.getRequiredFunding();
  const tx = await contract.fund({ value: required });
  const receipt = await tx.wait();

  return {
    ok: true,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    valueSent: required.toString(),
    valueSentEth: ethers.formatEther(required),
    txExplorerUrl: `https://chainscan-galileo.0g.ai/tx/${receipt.hash}`,
  };
}

export async function completeMilestoneOnChain(address, milestoneId) {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  if (!Number.isInteger(milestoneId) || milestoneId < 0) {
    throw new Error(
      `milestoneId must be a non-negative integer (got ${milestoneId})`,
    );
  }

  const contract = new ethers.Contract(address, getEscrowAbi(), getSigner());

  const count = await contract.getMilestoneCount();
  if (milestoneId >= Number(count)) {
    throw new Error(
      `milestoneId ${milestoneId} out of bounds (escrow has ${count} milestones)`,
    );
  }
  const before = await contract.getMilestone(milestoneId);
  if (before.completed) {
    throw new Error(`Milestone ${milestoneId} is already completed`);
  }

  const tx = await contract.completeMilestone(milestoneId, {
    gasLimit: COMPLETE_GAS_LIMIT,
  });
  const receipt = await tx.wait();

  const updated = await contract.getMilestone(milestoneId);

  return {
    ok: true,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    milestoneId,
    milestone: {
      id: milestoneId,
      name: updated.name,
      percentage: Number(updated.percentage),
      completed: updated.completed,
      amount: updated.amount.toString(),
      amountEth: ethers.formatEther(updated.amount),
      completedAt:
        Number(updated.completedAt) === 0
          ? null
          : new Date(Number(updated.completedAt) * 1000).toISOString(),
    },
    txExplorerUrl: `https://chainscan-galileo.0g.ai/tx/${receipt.hash}`,
  };
}
