import "dotenv/config";
import { ethers } from "ethers";

const RPC = process.env.SEPOLIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const TARGET_GWEI = 0.5; // aim above the 0.1 floor with headroom
const BURSTS = 30; // how many blocks to push for
const TXS_PER_BURST = 200; // self-sends per block

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const me = await wallet.getAddress();

console.log(`Bumping Sepolia base fee from wallet ${me}`);
console.log(`RPC: ${RPC}`);

for (let burst = 0; burst < BURSTS; burst++) {
  const block = await provider.getBlock("latest");
  const baseGwei = Number(block.baseFeePerGas) / 1e9;
  console.log(
    `\nBlock ${block.number}: base fee = ${baseGwei.toFixed(6)} gwei`,
  );
  if (block.baseFeePerGas >= ethers.parseUnits("0.15", "gwei")) {
    console.log("✅ Above floor with headroom — done.");
    break;
  }

  const nonce = await provider.getTransactionCount(me, "pending");
  const maxPriority = ethers.parseUnits(String(TARGET_GWEI), "gwei");
  const maxFee = block.baseFeePerGas + maxPriority * 4n;

  const txs = [];
  for (let i = 0; i < TXS_PER_BURST; i++) {
    txs.push(
      wallet.sendTransaction({
        to: me,
        value: 0n,
        nonce: nonce + i,
        maxPriorityFeePerGas: maxPriority,
        maxFeePerGas: maxFee,
        gasLimit: 21000n,
      }),
    );
  }
  const sent = await Promise.all(txs);
  console.log(
    `Sent ${sent.length} txs at nonce ${nonce}–${nonce + TXS_PER_BURST - 1}`,
  );
  await sent[sent.length - 1].wait();
}

const finalBlock = await provider.getBlock("latest");
console.log(
  `\nFinal base fee: ${(Number(finalBlock.baseFeePerGas) / 1e9).toFixed(6)} gwei`,
);
