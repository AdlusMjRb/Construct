import { Indexer, ZgFile } from "@0gfoundation/0g-ts-sdk";
import fs from "fs";
import path from "path";
import { config } from "../config.mjs";

export async function uploadSpec(milestoneData, signer, retries = 2) {
  const spec = {
    ...milestoneData,
    generatedBy: "Construct (claude-sonnet-4-5)",
    generatedAt: new Date().toISOString(),
    version: "0.2.0",
  };

  const tempFile = path.join(config.storage.tempDir, `spec-${Date.now()}.json`);
  fs.writeFileSync(tempFile, JSON.stringify(spec, null, 2));

  let zgFile = null;
  let uploadFile = null;

  try {
    zgFile = await ZgFile.fromFilePath(tempFile);
    const [tree, treeErr] = await zgFile.merkleTree();
    if (treeErr) throw new Error(`Merkle tree error: ${treeErr}`);
    const rootHash = tree.rootHash();
    await zgFile.close();
    zgFile = null;

    let lastErr = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        uploadFile = await ZgFile.fromFilePath(tempFile);
        const indexer = new Indexer(config.storage.indexerRpc);
        const [, uploadErr] = await indexer.upload(
          uploadFile,
          config.network.rpcUrl,
          signer,
        );
        await uploadFile.close();
        uploadFile = null;

        if (uploadErr) throw new Error(`Storage upload error: ${uploadErr}`);

        return {
          rootHash,
          specSize: fs.statSync(tempFile).size,
          attempts: attempt,
        };
      } catch (err) {
        lastErr = err;
        if (uploadFile) {
          try {
            await uploadFile.close();
          } catch (_) {}
          uploadFile = null;
        }
        if (attempt < retries) {
          const delay = attempt * 3000;
          console.log(
            `   ⚠️  0G Storage upload attempt ${attempt} failed: ${err.message}`,
          );
          console.log(`   🔄 Retrying in ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  } finally {
    if (zgFile) {
      try {
        await zgFile.close();
      } catch (_) {}
    }
    if (uploadFile) {
      try {
        await uploadFile.close();
      } catch (_) {}
    }
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
}
