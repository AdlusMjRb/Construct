import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { sepolia } from "./lib/chains";
import { parseEther, isAddress } from "viem";
import {
  apiGenerateMilestones,
  apiGetEscrow,
  apiGetProjectsByOwner,
  apiHandoverProject,
  apiLoadProject,
  apiMintSubname,
  apiPrepareProject,
  apiRepointSubname,
  apiSetRecords,
  apiSyncEns,
  apiTranslateSpec,
  apiTranslateVerification,
  apiVerifyEvidence,
} from "./lib/api";
import { P } from "./lib/tokens";
import type { OwnedProject } from "./lib/api";
import type {
  AcceptanceCriterion,
  DeploymentData,
  Milestone,
  VerificationResult,
} from "./lib/types";
import { AlertIcon, CheckIcon, PinIcon } from "./components/icons";
import { Shutter1Describe } from "./components/Shutter1Describe";
import { Shutter2Review } from "./components/Shutter2Review";
import { Shutter3Verify } from "./components/Shutter3Verify";
import {
  sepoliaPublicClient,
  PUBLIC_RESOLVER_ADDRESS,
  MPC_WALLET_ADDRESS,
  RESOLVER_APPROVAL_ABI,
} from "./lib/sepolia-client";

// ─── Constants ───────────────────────────────────────────────────

const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "uk", label: "Ukrainian", native: "Українська" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "sw", label: "Swahili", native: "Kiswahili" },
];

const GENERATE_MESSAGES = [
  "Analysing project scope...",
  "Structuring milestones...",
  "Calculating allocations...",
  "Finalising criteria...",
];

const DEPLOY_MESSAGES = [
  "Uploading to 0G Storage...",
  "Computing Merkle tree...",
  "Preparing contract...",
  "Ready for wallet confirmation...",
];

const AGENT_FEE_BPS = 500;

// Minimal ABI for the owner-initiated override path on escalated milestones.
const COMPLETE_MILESTONE_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "_id", type: "uint256" }],
    name: "completeMilestone",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const NAME_WRAPPER_ADDRESS =
  "0x0635513f179D50A207757E05759CbD106d7dFcE8" as const;

const NAME_WRAPPER_TRANSFER_ABI = [
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "bytes", name: "data", type: "bytes" },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────

const calculateFees = (milestoneList: Milestone[]) => {
  const budget = milestoneList.reduce(
    (sum, m) => sum + (parseFloat(m.price) || 0),
    0,
  );
  const agentFee = (budget * AGENT_FEE_BPS) / 10000;
  return { budget, agentFee, total: budget + agentFee };
};

const useLoadingMessages = (messages: string[], active: boolean) => {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const iv = setInterval(
      () => setIndex((i) => (i + 1) % messages.length),
      1800,
    );
    return () => clearInterval(iv);
  }, [active, messages]);
  return messages[index];
};

/**
 * Wait for a transaction receipt with resilience against 0G testnet RPC lag.
 * Inner: viem's built-in retryCount handles transient RPC errors per poll.
 * Outer: if waitForTransactionReceipt throws entirely, retry the whole call.
 */
async function waitForReceiptResilient(
  publicClient: ReturnType<typeof usePublicClient>,
  txHash: `0x${string}`,
  { outerAttempts = 5 } = {},
) {
  if (!publicClient) throw new Error("Public client not available");
  for (let attempt = 1; attempt <= outerAttempts; attempt++) {
    try {
      return await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 120_000,
        pollingInterval: 3_000,
        retryCount: 5,
        retryDelay: 2_000,
      });
    } catch (err) {
      if (attempt === outerAttempts) throw err;
      console.log(`Receipt attempt ${attempt} failed, retrying in 5s...`, err);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}
function relativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}
// ─── Main App ────────────────────────────────────────────────────

export default function App() {
  const { address: userAddress, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();

  // ─── Lifecycle state ───────────────────────────────────────────
  const [activeShutter, setActiveShutter] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string | null>(null);
  const [furthestShutter, setFurthestShutter] = useState(0);
  const [pinnedShutters, setPinnedShutters] = useState<Record<number, boolean>>(
    {},
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ─── Inherited project auto-detection ──────────────────────────
  const [inheritedProjectCount, setInheritedProjectCount] = useState<
    number | null | undefined
  >(undefined);
  useEffect(() => {
    if (!isConnected || !userAddress) {
      setInheritedProjectCount(undefined);
      return;
    }
    setInheritedProjectCount(null);
    apiGetProjectsByOwner(userAddress)
      .then((res) => setInheritedProjectCount(res.owned?.length ?? 0))
      .catch((err) => {
        console.warn("by-owner check failed:", err);
        setInheritedProjectCount(undefined);
      });
  }, [isConnected, userAddress]);
  // ─── Form state ────────────────────────────────────────────────
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [totalPool, setTotalPool] = useState("");
  const [devWallet, setDevWallet] = useState("");

  // ─── Domain state ──────────────────────────────────────────────
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [deploymentData, setDeploymentData] = useState<DeploymentData | null>(
    null,
  );
  const [evidenceFiles, setEvidenceFiles] = useState<Record<string, File[]>>(
    {},
  );
  const [evidenceText, setEvidenceText] = useState<Record<string, string>>({});
  const [verificationResults, setVerificationResults] = useState<
    Record<string, VerificationResult>
  >({});
  const [verifyingMilestone, setVerifyingMilestone] = useState<string | null>(
    null,
  );
  const [releasingMilestone, setReleasingMilestone] = useState<string | null>(
    null,
  );

  // ─── UI expansion state ────────────────────────────────────────
  const [expandedThoughts, setExpandedThoughts] = useState<
    Record<string, boolean>
  >({});
  const [expandedEvidence, setExpandedEvidence] = useState<
    Record<string, boolean>
  >({});
  const [expandedCriteria, setExpandedCriteria] = useState<
    Record<string, boolean>
  >({});

  // ─── Language state ────────────────────────────────────────────
  // canonicalLang: the language the spec was generated in (immutable record).
  // displayLang: what language the user is currently viewing on Shutter 3.
  // translatedMilestones: display-only translated spec. NEVER sent to verify —
  //                       the agent always reads the canonical `milestones`.
  // translatedVerificationResults: display-only translated verdicts. Same rule.
  //                       Canonical verificationResults is the audit record.
  const [canonicalLang, setCanonicalLang] = useState<string>("en");
  const [displayLang, setDisplayLang] = useState<string>("en");
  const [translatedMilestones, setTranslatedMilestones] = useState<
    Milestone[] | null
  >(null);
  const [translatedVerificationResults, setTranslatedVerificationResults] =
    useState<Record<string, VerificationResult> | null>(null);
  const [translating, setTranslating] = useState(false);
  const [sendingProject, setSendingProject] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [inheritedSubname, setInheritedSubname] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [ownedProjects, setOwnedProjects] = useState<OwnedProject[] | null>(
    null,
  );
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  // ─── Derived state ─────────────────────────────────────────────
  const APPROVING_MPC_MESSAGES = [
    "Granting Construct permission to update this project...",
    "Confirming approval on Sepolia...",
  ];

  const MINTING_SUBNAME_MESSAGES = [
    "Routing through MPC wallet...",
    "Signing on Sepolia...",
    "Wrapping ENS subname...",
    "Confirming on-chain...",
  ];

  const generateMsg = useLoadingMessages(
    GENERATE_MESSAGES,
    loadingPhase === "generating",
  );
  const deployMsg = useLoadingMessages(
    DEPLOY_MESSAGES,
    loadingPhase === "deploying",
  );
  const mintingMsg = useLoadingMessages(
    MINTING_SUBNAME_MESSAGES,
    loadingPhase === "minting-subname",
  );
  const approvingMsg = useLoadingMessages(
    APPROVING_MPC_MESSAGES,
    loadingPhase === "approving-mpc",
  );

  const fees = calculateFees(milestones);
  const allLocked = milestones.length > 0 && milestones.every((m) => m.locked);

  const displayMilestones = translatedMilestones || milestones;

  const displayResults =
    displayLang !== canonicalLang && translatedVerificationResults
      ? { ...verificationResults, ...translatedVerificationResults }
      : verificationResults;

  // ─── Effects ───────────────────────────────────────────────────

  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(null), 8000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  // ─── Handlers: generation ──────────────────────────────────────

  const handleGenerate = async () => {
    if (!projectTitle || !projectDescription || !totalPool) return;
    setLoadingPhase("generating");
    setIsTransitioning(true);
    setErrorMessage(null);
    try {
      const r = await apiGenerateMilestones(projectDescription, totalPool);
      setMilestones(r.milestones);
      setCanonicalLang(r.canonical_language);
      setDisplayLang(r.canonical_language);
      setTranslatedMilestones(null);
      setTranslatedVerificationResults(null);
      setTimeout(() => {
        setActiveShutter(1);
        setFurthestShutter((f) => Math.max(f, 1));
        setIsTransitioning(false);
        setLoadingPhase(null);
      }, 400);
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Generation failed");
      setIsTransitioning(false);
      setLoadingPhase(null);
    }
  };

  // ─── Handlers: milestone editing ───────────────────────────────

  const updateMilestone = (id: string, f: string, v: unknown) =>
    setMilestones((ms) => ms.map((m) => (m.id === id ? { ...m, [f]: v } : m)));

  const updateCriterion = (
    milestoneId: string,
    criterionIndex: number,
    updated: AcceptanceCriterion,
  ) => {
    setMilestones((ms) =>
      ms.map((m) => {
        if (m.id !== milestoneId) return m;
        const newCriteria = [...m.acceptance_criteria];
        newCriteria[criterionIndex] = updated;
        return { ...m, acceptance_criteria: newCriteria };
      }),
    );
  };

  const toggleLock = (id: string) =>
    setMilestones((ms) =>
      ms.map((m) => (m.id === id ? { ...m, locked: !m.locked } : m)),
    );

  const deleteMilestone = (id: string) => {
    setMilestones((ms) => {
      const remaining = ms.filter((m) => m.id !== id);
      if (remaining.length === 0) return remaining;
      const each = Math.floor(100 / remaining.length);
      const leftover = 100 - each * remaining.length;
      return remaining.map((m, i) => {
        const pct = i === remaining.length - 1 ? each + leftover : each;
        const budget = parseFloat(totalPool) || 0;
        return {
          ...m,
          percentage: pct,
          price: ((budget * pct) / 100).toFixed(4),
        };
      });
    });
  };

  // ─── Handlers: deployment ──────────────────────────────────────

  const handleDeploy = async () => {
    if (!allLocked) return;
    if (!devWallet) {
      setErrorMessage("Developer wallet address is required.");
      return;
    }
    if (!isConnected || !walletClient || !publicClient || !userAddress) {
      setErrorMessage("Please connect your wallet first.");
      return;
    }
    setLoadingPhase("deploying");
    setIsTransitioning(true);
    setErrorMessage(null);
    try {
      const prepared = await apiPrepareProject({
        milestones,
        developerWallet: devWallet,
        userWallet: userAddress,
        projectTitle,
        projectSummary: projectDescription,
        totalBudget: totalPool,
        canonicalLanguage: canonicalLang,
      });
      setLoadingPhase("wallet-deploy");
      const deployHash = await walletClient.deployContract({
        abi: prepared.contract.abi,
        bytecode: prepared.contract.bytecode as `0x${string}`,
        args: [
          milestones.map((m) => m.header),
          milestones.map((m) => BigInt(m.percentage)),
          devWallet as `0x${string}`,
          prepared.agentAddress as `0x${string}`,
          prepared.storageHash,
          parseEther(fees.budget.toString()),
          "0x0000000000000000000000000000000000000000" as `0x${string}`,
          0n,
        ],
        value: parseEther(fees.total.toString()),
      });

      const deployReceipt = await waitForReceiptResilient(
        publicClient,
        deployHash,
      );
      if (!deployReceipt || !deployReceipt.contractAddress) {
        throw new Error("Contract deployment failed");
      }
      const contractAddress = deployReceipt.contractAddress;

      // Cross-chain step. Two branches:
      //   - Fresh project: mint a brand new ENS subname for this escrow.
      //   - Inherited project: SKIP mint. The recipient already owns the
      //     subname (NFT was transferred in handover), and the deploy
      //     below will repoint it at the new escrow after resolver
      //     approval. Same NFT, new escrow — that's the loop.
      let ensData: Awaited<ReturnType<typeof apiMintSubname>> | null = null;
      if (inheritedSubname) {
        console.log(
          `Inherited project — skipping mint, will repoint ${inheritedSubname}`,
        );
        // Synthesise a minimal ensData object so the rest of the deploy
        // flow (resolver approval, deploymentData wiring) doesn't have
        // to special-case inheritance. Token id and full name are what
        // matter for downstream display + send-project capability.
        // Construct doesn't have the tokenId client-side; the backend will
        // verify it against ownership when /repoint runs. For UI state
        // we leave tokenId as the subname for now and pull a real one
        // from the registry on next load if needed.
        ensData = {
          label: inheritedSubname.replace(".construct.eth", ""),
          fullName: inheritedSubname,
          tokenId: "",
          ownerWallet: userAddress,
          confirmedAt: new Date().toISOString(),
          elapsedMs: 0,
          escrowAddress: contractAddress,
          sepoliaScanUrl: `https://sepolia.app.ens.domains/${inheritedSubname}`,
        };
      } else {
        setLoadingPhase("minting-subname");
        try {
          ensData = await apiMintSubname({
            escrowAddress: contractAddress,
            userWallet: userAddress,
            projectTitle,
          });
        } catch (mintErr) {
          console.error(
            "Subname mint failed (escrow still deployed):",
            mintErr,
          );
          setErrorMessage(
            "Project escrow deployed successfully, but ENS identity could not be minted. You can retry from the project view.",
          );
        }
      }

      // Approval step: grant MPC permission to write text records on the
      // PublicResolver. Resolver approval is per-(owner, operator), not
      // per-name, so this is a one-time grant covering all current and
      // future projects this user creates. Construct uses localStorage to skip
      // re-prompting users who've already approved (the resolver doesn't
      // expose a cheap on-chain readback).
      let resolverAuthorised = false;
      if (ensData) {
        try {
          const approvalKey = `resolver-approved:${userAddress.toLowerCase()}`;
          const alreadyApproved = localStorage.getItem(approvalKey) === "true";

          if (!alreadyApproved) {
            setLoadingPhase("approving-mpc");
            await switchChainAsync({ chainId: sepolia.id });

            // WalletConnect's session namespace updates async after a
            // chain switch — without this delay, writeContract fires
            // before WC's isValidRequest() sees Sepolia as approved
            // and rejects with "Missing or invalid. request() chainId".
            // Only bites recipient wallets that haven't previously
            // hit Sepolia in this session (funder skips this branch
            // entirely via the localStorage cache).
            await new Promise((resolve) => setTimeout(resolve, 1500));

            const approvalHash = await walletClient.writeContract({
              chain: sepolia,
              address: PUBLIC_RESOLVER_ADDRESS,
              abi: RESOLVER_APPROVAL_ABI,
              functionName: "setApprovalForAll",
              args: [MPC_WALLET_ADDRESS, true],
            });
            await sepoliaPublicClient.waitForTransactionReceipt({
              hash: approvalHash,
              timeout: 120_000,
              pollingInterval: 4_000,
            });
            localStorage.setItem(approvalKey, "true");
            console.log("Resolver approval granted on Sepolia:", approvalHash);
          } else {
            console.log("Resolver approval cached locally, skipping prompt");
          }
          resolverAuthorised = true;
        } catch (approvalErr) {
          console.error("Resolver approval failed:", approvalErr);
          setErrorMessage(
            "ENS identity created, but Construct couldn't be authorised to update its records. The agent will still complete milestones — you can grant permission later.",
          );
        }
      }

      // Records writes, fresh mint vs inherited repoint take different
      // backend endpoints. Both fire-and-forget so the user reaches
      // Shutter 3 immediately while Sepolia confirms in the background.
      if (ensData && resolverAuthorised) {
        if (inheritedSubname) {
          // Repoint: same subname now points at the new escrow. Also
          // flips status from handed_over → in_progress and clears the
          // handed_over_to record.
          apiRepointSubname({
            subname: inheritedSubname,
            newEscrowAddress: contractAddress,
            newPayee: devWallet,
            newMilestoneCount: milestones.length,
          })
            .then(() => {
              console.log(`Repointed ${inheritedSubname} → ${contractAddress}`);
            })
            .catch((err) => {
              console.error("repoint failed (non-fatal):", err);
            });
        } else {
          apiSetRecords({
            subname: ensData.fullName,
            escrowAddress: contractAddress,
            payeeAddress: devWallet,
            milestoneCount: milestones.length,
          }).catch((err) => {
            console.error("set-records failed (non-fatal):", err);
          });
        }
      }

      setDeploymentData({
        contractAddress,
        storageHash: prepared.storageHash,
        deployTxHash: deployHash,
        agentAddress: prepared.agentAddress,
        chainScanUrl: `https://chainscan-galileo.0g.ai/address/${contractAddress}`,
        storageScanUrl: prepared.storageScanUrl,
        escrowAmount: fees.budget.toFixed(4),
        agentReserve: fees.agentFee.toFixed(4),
        ensSubname: ensData?.fullName ?? null,
        ensTokenId: ensData?.tokenId ?? null,
        ensSepoliaUrl: ensData?.sepoliaScanUrl ?? null,
      });
      setTimeout(() => {
        setActiveShutter(2);
        setFurthestShutter((f) => Math.max(f, 2));
        setIsTransitioning(false);
        setLoadingPhase(null);
        setInheritedSubname(null);
      }, 400);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Deployment failed";
      setErrorMessage(msg.includes("rejected") ? "Transaction rejected." : msg);
      setIsTransitioning(false);
      setLoadingPhase(null);
    }
  };

  // ─── Handlers: evidence ────────────────────────────────────────

  const handleFileUpload = (mid: string, files: FileList) =>
    setEvidenceFiles((p) => ({
      ...p,
      [mid]: [...(p[mid] || []), ...Array.from(files)],
    }));

  const removeFile = (mid: string, fileIndex: number) =>
    setEvidenceFiles((p) => ({
      ...p,
      [mid]: (p[mid] || []).filter((_, i) => i !== fileIndex),
    }));

  /**
   * Translate a single verification result and store it in the translated
   * view. Canonical verificationResults is never mutated here.
   */
  const translateAndStoreResult = async (
    milestoneId: string,
    result: VerificationResult,
    lang: string,
  ) => {
    if (lang === canonicalLang) return;
    if (!deploymentData) return;
    try {
      const translated = await apiTranslateVerification(
        result,
        lang,
        canonicalLang,
      );
      setTranslatedVerificationResults((prev) => ({
        ...(prev || {}),
        [milestoneId]: translated,
      }));
      const cacheKey = `translation-verify:${deploymentData.contractAddress}:${lang}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        const existing = cached ? JSON.parse(cached) : {};
        existing[milestoneId] = translated;
        localStorage.setItem(cacheKey, JSON.stringify(existing));
      } catch {
        // cache unavailable — non-fatal
      }
    } catch (e) {
      console.error("Verification translation failed", e);
    }
  };

  const handleVerifySingle = async (
    milestoneId: string,
    milestoneIndex: number,
  ) => {
    if (verifyingMilestone || !deploymentData) return;
    setVerifyingMilestone(milestoneId);
    setLoadingPhase("verifying");
    setErrorMessage(null);
    const files = evidenceFiles[milestoneId] || [];
    let evidence = evidenceText[milestoneId] || "";
    for (const file of files) {
      if (
        file.type.startsWith("text/") ||
        file.name.endsWith(".txt") ||
        file.name.endsWith(".md")
      ) {
        try {
          evidence += `\n\n--- File: ${file.name} ---\n${await file.text()}`;
        } catch {
          evidence += `\n\n[File: ${file.name} - could not read]`;
        }
      }
    }
    if (evidence.trim().length < 10 && files.length === 0) {
      setErrorMessage("Please provide evidence text or upload files.");
      setVerifyingMilestone(null);
      setLoadingPhase(null);
      return;
    }
    if (evidence.trim().length < 10)
      evidence = `${files.length} file(s) submitted as visual evidence.`;
    try {
      // INVARIANT: always verify against canonical milestones, never the
      // translated display copies. The agent's world is monolingual —
      // language is a view-layer concern only.
      const m = milestones[milestoneIndex];
      const r = await apiVerifyEvidence({
        contractAddress: deploymentData.contractAddress,
        milestoneId: milestoneIndex,
        evidence: evidence.trim(),
        acceptance_criteria: m.acceptance_criteria,
        verification_confidence: m.verification_confidence,
        files: files.filter((f) => f.type.startsWith("image/")),
        subname: deploymentData.ensSubname ?? undefined,
      });
      setVerificationResults((p) => ({ ...p, [milestoneId]: r }));
      // If the user is viewing in a non-canonical language, translate the
      // new result in-place so they see it in their language. Fire-and-
      // forget — canonical is already rendered, translation catches up.
      if (displayLang !== canonicalLang) {
        void translateAndStoreResult(milestoneId, r, displayLang);
      }
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Verification failed");
    }
    setVerifyingMilestone(null);
    setLoadingPhase(null);
  };

  /**
   * Manual override for escalated milestones.
   * The connected wallet (project owner) calls completeMilestone() directly.
   * The contract's onlyOwnerOrAgent modifier permits this, no backend round-trip.
   */
  const handleManualRelease = async (
    milestoneId: string,
    milestoneIndex: number,
  ) => {
    if (!deploymentData) return;
    if (!walletClient || !publicClient) {
      setErrorMessage("Wallet not connected.");
      return;
    }
    setReleasingMilestone(milestoneId);
    setErrorMessage(null);
    try {
      const txHash = await walletClient.writeContract({
        address: deploymentData.contractAddress as `0x${string}`,
        abi: COMPLETE_MILESTONE_ABI,
        functionName: "completeMilestone",
        args: [BigInt(milestoneIndex)],
      });

      const receipt = await waitForReceiptResilient(publicClient, txHash);
      if (!receipt) throw new Error("Failed to confirm release transaction");

      // Re-read project state from chain to pick up the released amount and payee
      const project = await apiGetEscrow(deploymentData.contractAddress);
      const completedMilestone = project.milestones?.[milestoneIndex];

      const updatedResult: VerificationResult = {
        ...verificationResults[milestoneId],
        approved: true,
        paymentTxHash: txHash,
        reasoning:
          verificationResults[milestoneId].reasoning +
          " [MANUALLY APPROVED BY OWNER]",
        amountReleased: completedMilestone?.amount,
        payee: project.payee,
        chainScanUrl: `https://chainscan-galileo.0g.ai/tx/${txHash}`,
      };
      setVerificationResults((p) => ({ ...p, [milestoneId]: updatedResult }));
      if (displayLang !== canonicalLang) {
        void translateAndStoreResult(milestoneId, updatedResult, displayLang);
      }

      // Cross-chain sync: ENS records on Sepolia don't auto-update when the
      // owner bypasses the agent path. Fire from backend so the agent owns
      // ENS bookkeeping regardless of who triggered the release. Fire-and-
      // forget — the user's release is already confirmed on 0G, this is
      // background bookkeeping (~80s on Sepolia).
      if (deploymentData.ensSubname) {
        apiSyncEns({
          contractAddress: deploymentData.contractAddress,
          subname: deploymentData.ensSubname,
        }).catch((err) => {
          console.error("ENS sync after manual release failed:", err);
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Manual release failed";
      setErrorMessage(msg.includes("rejected") ? "Transaction rejected." : msg);
    }
    setReleasingMilestone(null);
  };

  /**
   * Send the project NFT to a new owner on Sepolia.
   *
   * Order matters here:
   *   1. Write handover records to ENS (status=handed_over, handed_over_to).
   *      The MPC writes via the SENDER's existing setApprovalForAll. Once
   *      the NFT moves, that approval is no longer valid for these writes
   *      (resolver re-checks ownerOf on every setter and the new owner
   *      hasn't granted approval yet).
   *   2. Then sign the NFT transfer.
   *
   * If the records fail, we abort the transfer — the recipient should
   * never receive a project whose audit trail wasn't sealed first.
   */
  const handleSendProject = async (recipientAddress: string) => {
    if (!deploymentData?.ensSubname || !deploymentData?.ensTokenId) {
      setErrorMessage(
        "Project missing ENS identity — handover requires an ENS subname.",
      );
      return;
    }
    if (!walletClient || !userAddress) {
      setErrorMessage("Connect your wallet to send the project.");
      return;
    }
    if (!isAddress(recipientAddress)) {
      setErrorMessage("Recipient address is not valid.");
      return;
    }
    if (recipientAddress.toLowerCase() === userAddress.toLowerCase()) {
      setErrorMessage("Recipient must be a different wallet.");
      return;
    }

    setSendingProject(true);
    setErrorMessage(null);

    try {
      // Step 1: seal the audit trail BEFORE the NFT moves. While the
      // sender still owns the subname, the MPC's resolver approval grants
      // it write access via the resolver's ownerOf check. Once the NFT
      // transfers, those writes would revert until the new owner grants
      // their own approval — too late to mark THIS old escrow as
      // "handed_over". So we do the records first, transfer second.
      console.log("Sealing handover records on ENS...");
      const handover = await apiHandoverProject({
        subname: deploymentData.ensSubname,
        newOwner: recipientAddress,
      });

      const failedRecords = handover.records.filter(
        (r) => r.status === "failed",
      );
      if (failedRecords.length > 0) {
        throw new Error(
          `ENS handover records failed: ${failedRecords.map((r) => r.key).join(", ")}. NFT transfer aborted.`,
        );
      }
      console.log("Handover records confirmed:", handover.records);

      // Step 2: NFT transfer on Sepolia. Now safe — audit trail says
      // "handed over to <recipient>" before the recipient's wallet ever
      // touches the subname.
      await switchChainAsync({ chainId: sepolia.id });

      const txHash = await walletClient.writeContract({
        chain: sepolia,
        address: NAME_WRAPPER_ADDRESS,
        abi: NAME_WRAPPER_TRANSFER_ABI,
        functionName: "safeTransferFrom",
        args: [
          userAddress as `0x${string}`,
          recipientAddress as `0x${string}`,
          BigInt(deploymentData.ensTokenId),
          1n,
          "0x",
        ],
      });

      await sepoliaPublicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 120_000,
        pollingInterval: 4_000,
      });

      console.log(
        `Project NFT transferred to ${recipientAddress} on Sepolia: ${txHash}`,
      );

      setSendModalOpen(false);
      setErrorMessage(null);
      alert(
        `Project sent to ${recipientAddress}. The recipient can now load the project from their wallet on Shutter 1.`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transfer failed";
      setErrorMessage(msg.includes("rejected") ? "Transaction rejected." : msg);
    }

    setSendingProject(false);
  };

  /**
   * Entry point on Shutter 1 — "Load Existing Project".
   *
   * Queries the backend for any subnames the connected wallet currently
   * owns. Behaviour:
   *   - 0 results → show error
   *   - 1 result  → auto-load it (smoothest demo path)
   *   - 2+ results → open picker modal, user chooses one
   */
  const handleLoadProjectsClick = async () => {
    if (!isConnected || !userAddress) {
      setErrorMessage("Connect your wallet to load existing projects.");
      return;
    }
    setLoadingProjects(true);
    setErrorMessage(null);
    try {
      const result = await apiGetProjectsByOwner(userAddress);
      if (result.owned.length === 0) {
        setErrorMessage(
          "No projects found in this wallet. Start a new one above.",
        );
        setLoadingProjects(false);
        return;
      }
      if (result.owned.length === 1) {
        // Auto-load — no picker needed.
        await loadInheritedProject(result.owned[0].subname);
        return;
      }
      // 2+ owned — show picker, user chooses.
      setOwnedProjects(result.owned);
      setProjectPickerOpen(true);
    } catch (e: unknown) {
      setErrorMessage(
        e instanceof Error ? e.message : "Failed to load projects",
      );
    }
    setLoadingProjects(false);
  };

  const loadInheritedProject = async (subname: string) => {
    setLoadingProjects(true);
    setErrorMessage(null);
    try {
      const data = await apiLoadProject(subname);

      if (data.mode === "continue") {
        // Project is live and in_progress — restore the deployment data
        // and jump to Shutter 3 so the recipient can submit evidence
        // against the existing escrow.
        const escrow = await apiGetEscrow(data.inheritedFrom.oldEscrowAddress);

        // Reconstruct the full milestones array from on-chain state +
        // recovered spec. Different from the redeploy path: we want ALL
        // milestones (completed and remaining) so Shutter 3 can show
        // the full history, not just what's left.
        const allMilestones: Milestone[] = escrow.milestones.map((m, i) => {
          // Try to find the rich spec for this milestone if available
          const fromSpec = data.remainingMilestones.find(
            (rm) => rm.name === m.name,
          );
          return {
            id: crypto.randomUUID(),
            header: m.name,
            description: fromSpec?.description ?? "",
            evidenceRequired:
              fromSpec?.acceptance_criteria
                .map((c) => `[${c.evidence_type}] ${c.evidence_instruction}`)
                .join(" | ") ?? "",
            acceptance_criteria: fromSpec?.acceptance_criteria ?? [],
            verification_confidence:
              fromSpec?.verification_confidence ?? "medium",
            price: m.amount,
            percentage: m.percentage,
            locked: true, // already deployed; lock for display
            completed: m.completed, // ← assumes Milestone type has this
          };
        });

        setProjectTitle(data.project.title);
        setProjectDescription(data.project.summary);
        setMilestones(allMilestones);
        setCanonicalLang(data.project.canonical_language);
        setDisplayLang(data.project.canonical_language);
        setTranslatedMilestones(null);
        setTranslatedVerificationResults(null);

        // Restore deployment data so Shutter 3 has everything it needs.
        setDeploymentData({
          contractAddress: data.inheritedFrom.oldEscrowAddress,
          storageHash: data.inheritedFrom.oldStorageHash,
          deployTxHash: "" as `0x${string}`, // not recoverable, leave blank
          agentAddress: "", // backend can supply this if needed
          chainScanUrl: `https://chainscan-galileo.0g.ai/address/${data.inheritedFrom.oldEscrowAddress}`,
          storageScanUrl: "",
          escrowAmount: escrow.budget?.toString() ?? "0",
          agentReserve: "0",
          ensSubname: data.inheritedFrom.subname,
          ensTokenId: null, // can be re-fetched from registry if needed
          ensSepoliaUrl: `https://sepolia.app.ens.domains/${data.inheritedFrom.subname}`,
        });

        // Reset evidence/verification state — those are fresh per-session.
        setEvidenceFiles({});
        setEvidenceText({});
        setVerificationResults({});

        // NOT setting inheritedSubname — we are NOT redeploying, so the
        // deploy flow should never fire on this project.
        setInheritedSubname(null);

        setProjectPickerOpen(false);
        setOwnedProjects(null);
        setActiveShutter(2);
        setFurthestShutter(2);
        return;
      }

      if (data.mode === "completed") {
        setErrorMessage(
          "This project is complete. All milestones have been verified and paid.",
        );
        setProjectPickerOpen(false);
        setLoadingProjects(false);
        return;
      }

      // Default path: redeploy. This is your existing logic — the recipient
      // needs to deploy a fresh escrow under this subname (handed_over, or
      // existing escrow doesn't exist on-chain anymore).
      if (data.remainingMilestones.length === 0) {
        throw new Error(
          "All milestones on this project are already complete — nothing to continue.",
        );
      }

      const inherited: Milestone[] = data.remainingMilestones.map((m) => ({
        id: crypto.randomUUID(),
        header: m.name,
        description: m.description,
        evidenceRequired: m.acceptance_criteria
          .map((c) => `[${c.evidence_type}] ${c.evidence_instruction}`)
          .join(" | "),
        acceptance_criteria: m.acceptance_criteria,
        verification_confidence: m.verification_confidence,
        price: m.amountEth,
        percentage: m.percentage,
        locked: false,
      }));

      const inheritedTotal = inherited.reduce(
        (sum, m) => sum + parseFloat(m.price || "0"),
        0,
      );

      setProjectTitle(data.project.title);
      setProjectDescription(data.project.summary);
      setTotalPool(inheritedTotal.toString());
      setDevWallet(data.project.suggested_payee);
      setMilestones(inherited);
      setCanonicalLang(data.project.canonical_language);
      setDisplayLang(data.project.canonical_language);
      setTranslatedMilestones(null);
      setTranslatedVerificationResults(null);
      setInheritedSubname(subname);
      setDeploymentData(null);
      setEvidenceFiles({});
      setEvidenceText({});
      setVerificationResults({});

      setProjectPickerOpen(false);
      setOwnedProjects(null);
      setActiveShutter(1);
      setFurthestShutter((f) => Math.max(f, 1));
    } catch (e: unknown) {
      setErrorMessage(
        e instanceof Error ? e.message : "Failed to load project",
      );
    }
    setLoadingProjects(false);
  };
  // ─── Handlers: language switching ──────────────────────────────

  /**
   * Translates the current spec AND any existing verification results on the
   * fly. Canonical `milestones` and `verificationResults` are never mutated.
   * Cache both, keyed by contract+lang, in localStorage for instant flip-back.
   */
  const handleLanguageChange = async (newLang: string) => {
    setDisplayLang(newLang);

    // Switching back to canonical, drop both translated views.
    if (newLang === canonicalLang) {
      setTranslatedMilestones(null);
      setTranslatedVerificationResults(null);
      return;
    }

    if (!deploymentData) return;

    const specCacheKey = `translation:${deploymentData.contractAddress}:${newLang}`;
    const verifyCacheKey = `translation-verify:${deploymentData.contractAddress}:${newLang}`;

    let specCached = false;
    const cachedSpec = localStorage.getItem(specCacheKey);
    if (cachedSpec) {
      try {
        setTranslatedMilestones(JSON.parse(cachedSpec));
        specCached = true;
      } catch {
        // fall through to re-fetch
      }
    }

    let cachedVerifyMap: Record<string, VerificationResult> = {};
    const cachedVerify = localStorage.getItem(verifyCacheKey);
    if (cachedVerify) {
      try {
        cachedVerifyMap = JSON.parse(cachedVerify);
        setTranslatedVerificationResults(cachedVerifyMap);
      } catch {
        cachedVerifyMap = {};
      }
    }

    const needSpec = !specCached;
    const existingResultIds = Object.keys(verificationResults);
    const cachedIds = Object.keys(cachedVerifyMap);
    const missingResultIds = existingResultIds.filter(
      (id) => !cachedIds.includes(id),
    );

    if (!needSpec && missingResultIds.length === 0) return;

    setTranslating(true);
    try {
      const tasks: Promise<void>[] = [];

      if (needSpec) {
        const spec = {
          project_title: projectTitle,
          project_summary: projectDescription,
          milestones: milestones.map((m) => ({
            name: m.header,
            description: m.description,
            acceptance_criteria: m.acceptance_criteria,
            verification_confidence: m.verification_confidence,
            percentage: m.percentage,
          })),
        };
        tasks.push(
          (async () => {
            const result = await apiTranslateSpec(spec, newLang, canonicalLang);
            const translated: Milestone[] = milestones.map((orig, i) => {
              const tm = result.spec.milestones[i];
              if (!tm) return orig;
              const translatedCriteria: AcceptanceCriterion[] =
                orig.acceptance_criteria.map((oc, ci) => {
                  const tc = tm.acceptance_criteria?.[ci];
                  if (!tc) return oc;
                  return {
                    ...oc,
                    description: tc.description || oc.description,
                    evidence_instruction:
                      tc.evidence_instruction || oc.evidence_instruction,
                  };
                });
              return {
                ...orig,
                header: tm.name || orig.header,
                description: tm.description || orig.description,
                acceptance_criteria: translatedCriteria,
                evidenceRequired: translatedCriteria
                  .map((c) => `[${c.evidence_type}] ${c.evidence_instruction}`)
                  .join(" | "),
              };
            });
            setTranslatedMilestones(translated);
            try {
              localStorage.setItem(specCacheKey, JSON.stringify(translated));
            } catch {
              // non-fatal
            }
          })(),
        );
      }

      // Translate each missing verification result in parallel.
      for (const mid of missingResultIds) {
        tasks.push(
          translateAndStoreResult(mid, verificationResults[mid], newLang),
        );
      }

      await Promise.all(tasks);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Translation failed");
      setDisplayLang(canonicalLang);
      setTranslatedMilestones(null);
      setTranslatedVerificationResults(null);
    }
    setTranslating(false);
  };

  // ─── Handlers: shutter chrome ──────────────────────────────────

  const toggleThought = (id: string) =>
    setExpandedThoughts((p) => ({ ...p, [id]: !p[id] }));
  const toggleEvidence = (id: string) =>
    setExpandedEvidence((p) => ({ ...p, [id]: !p[id] }));
  const toggleCriteria = (id: string) =>
    setExpandedCriteria((p) => ({ ...p, [id]: !p[id] }));

  const handleShutterClick = (i: number) => {
    if (i > furthestShutter || isTransitioning) return;
    setActiveShutter(i);
  };

  const togglePin = (i: number, e: ReactMouseEvent) => {
    e.stopPropagation();
    setPinnedShutters((p) => ({ ...p, [i]: !p[i] }));
  };

  const getShutterWidth = (i: number) => {
    const oc = [0, 1, 2].filter(
      (x) => x === activeShutter || pinnedShutters[x],
    ).length;
    const cw = 52;
    if (activeShutter === i || pinnedShutters[i])
      return `calc((100% - ${(3 - oc) * cw}px) / ${oc})`;
    return `${cw}px`;
  };

  const isShutterOpen = (i: number) => activeShutter === i || pinnedShutters[i];
  const isShutterFrozen = (i: number) => i < furthestShutter;

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        overflow: "hidden",
        background: P.bg,
        fontFamily: "'Space Grotesk', sans-serif",
        position: "relative",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap"
        rel="stylesheet"
      />

      <div
        style={{ position: "fixed", top: "16px", left: "16px", zIndex: 100 }}
      >
        <ConnectButton
          chainStatus="icon"
          accountStatus="address"
          showBalance={true}
        />
      </div>

      {errorMessage && (
        <div
          style={{
            position: "fixed",
            top: "16px",
            right: "16px",
            zIndex: 1001,
            background: "#fef2f2",
            color: P.red,
            border: "1px solid #fecaca",
            padding: "12px 20px",
            borderRadius: "12px",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 8px 32px rgba(220,38,38,0.15)",
            maxWidth: "400px",
            cursor: "pointer",
          }}
          onClick={() => setErrorMessage(null)}
        >
          <AlertIcon /> {errorMessage}
        </div>
      )}

      {(loadingPhase || verifyingMilestone || releasingMilestone) &&
        !errorMessage && (
          <div
            style={{
              position: "fixed",
              top: "16px",
              right: "16px",
              zIndex: 1000,
              background: P.teal,
              color: "#fff",
              padding: "12px 28px",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              boxShadow: "0 8px 32px rgba(15,113,115,0.3)",
              whiteSpace: "nowrap",
            }}
          >
            <span className="spinner" />{" "}
            {loadingPhase === "generating"
              ? generateMsg
              : loadingPhase === "deploying"
                ? deployMsg
                : loadingPhase === "wallet-deploy"
                  ? "Confirm in wallet to deploy contract..."
                  : loadingPhase === "minting-subname"
                    ? mintingMsg
                    : loadingPhase === "approving-mpc"
                      ? approvingMsg
                      : releasingMilestone
                        ? "Confirm in wallet to release payment..."
                        : "Verifying evidence..."}
          </div>
        )}
      {projectPickerOpen && ownedProjects && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => !loadingProjects && setProjectPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "28px",
              width: "520px",
              maxWidth: "92vw",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              style={{
                margin: 0,
                marginBottom: "8px",
                fontSize: "18px",
                fontWeight: 700,
                color: P.text,
              }}
            >
              Choose Project to Load
            </h3>
            <p
              style={{
                margin: 0,
                marginBottom: "20px",
                fontSize: "13px",
                color: P.textMid,
                lineHeight: 1.6,
              }}
            >
              Your wallet owns {ownedProjects.length} projects. Newest first.
            </p>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {ownedProjects.map((p) => (
                <button
                  key={p.subname}
                  onClick={() => loadInheritedProject(p.subname)}
                  disabled={loadingProjects}
                  style={{
                    textAlign: "left",
                    padding: "14px 16px",
                    background: "#f9fafb",
                    border: `1px solid ${P.cardBorder}`,
                    borderRadius: "10px",
                    cursor: loadingProjects ? "wait" : "pointer",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: P.text,
                      marginBottom: "4px",
                    }}
                  >
                    {p.subname}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        color: P.textDim,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {p.escrowAddress.slice(0, 10)}...
                      {p.escrowAddress.slice(-8)}
                    </div>
                    <div
                      style={{
                        fontSize: "10px",
                        color: P.textDim,
                        fontWeight: 600,
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                      }}
                    >
                      {relativeTime(p.updatedAt) || relativeTime(p.mintedAt)}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setProjectPickerOpen(false)}
              disabled={loadingProjects}
              style={{
                marginTop: "16px",
                width: "100%",
                padding: "12px",
                background: "#f3f4f6",
                border: `1px solid ${P.cardBorder}`,
                borderRadius: "10px",
                color: P.textMid,
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {[0, 1, 2].map((index) => {
        const isOpen = isShutterOpen(index);
        const isPast = index <= furthestShutter;
        const isClickable = isPast && !isTransitioning;
        const isPinned = pinnedShutters[index];
        const frozen = isShutterFrozen(index);

        return (
          <div
            key={index}
            style={{
              width: getShutterWidth(index),
              height: "100%",
              transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
              position: "relative",
              overflow: "hidden",
              borderRight: index < 2 ? `1px solid ${P.divider}` : "none",
              background: isOpen ? P.shutterBg : P.shutterClosed,
            }}
          >
            {!isOpen && (
              <div
                onClick={() => handleShutterClick(index)}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "14px",
                  opacity: isClickable ? 1 : 0.35,
                  cursor: isClickable ? "pointer" : "default",
                }}
              >
                <span
                  style={{
                    writingMode: "vertical-rl",
                    textOrientation: "mixed",
                    color: isPast ? P.teal : P.textDim,
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "3px",
                    textTransform: "uppercase",
                  }}
                >
                  {["01", "02", "03"][index]} —{" "}
                  {["Describe", "Review", "Evidence"][index]}
                </span>
                {isPast && index < furthestShutter && (
                  <div style={{ color: P.teal }}>
                    <CheckIcon />
                  </div>
                )}
              </div>
            )}

            {isOpen && furthestShutter >= 2 && (
              <button
                onClick={(e) => togglePin(index, e)}
                style={{
                  position: "absolute",
                  top: "14px",
                  right: "14px",
                  zIndex: 10,
                  background: isPinned ? P.tealSoft : "#fff",
                  border: `1px solid ${isPinned ? P.tealBorder : P.cardBorder}`,
                  borderRadius: "8px",
                  padding: "6px 10px",
                  cursor: "pointer",
                  color: isPinned ? P.teal : P.textDim,
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  fontFamily: "'Space Grotesk', sans-serif",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <PinIcon pinned={!!isPinned} /> {isPinned ? "Pinned" : "Pin"}
              </button>
            )}

            {index === 0 && isOpen && (
              <Shutter1Describe
                projectTitle={projectTitle}
                setProjectTitle={setProjectTitle}
                projectDescription={projectDescription}
                setProjectDescription={setProjectDescription}
                totalPool={totalPool}
                setTotalPool={setTotalPool}
                devWallet={devWallet}
                setDevWallet={setDevWallet}
                frozen={frozen}
                isTransitioning={isTransitioning}
                isActive={activeShutter === 0}
                loadingPhase={loadingPhase}
                onGenerate={handleGenerate}
                isConnected={isConnected}
                loadingProjects={loadingProjects}
                onLoadExistingClick={handleLoadProjectsClick}
                inheritedProjectCount={inheritedProjectCount}
              />
            )}

            {index === 1 && isOpen && (
              <Shutter2Review
                milestones={milestones}
                expandedCriteria={expandedCriteria}
                toggleCriteria={toggleCriteria}
                updateMilestone={updateMilestone}
                updateCriterion={updateCriterion}
                toggleLock={toggleLock}
                deleteMilestone={deleteMilestone}
                fees={fees}
                allLocked={allLocked}
                frozen={frozen}
                isTransitioning={isTransitioning}
                isActive={activeShutter === 1}
                loadingPhase={loadingPhase}
                onDeploy={handleDeploy}
              />
            )}

            {index === 2 && isOpen && (
              <Shutter3Verify
                displayMilestones={displayMilestones}
                displayResults={displayResults}
                deploymentData={deploymentData}
                evidenceFiles={evidenceFiles}
                evidenceText={evidenceText}
                setEvidenceText={setEvidenceText}
                handleFileUpload={handleFileUpload}
                removeFile={removeFile}
                expandedThoughts={expandedThoughts}
                toggleThought={toggleThought}
                expandedEvidence={expandedEvidence}
                toggleEvidence={toggleEvidence}
                expandedCriteria={expandedCriteria}
                setExpandedCriteria={setExpandedCriteria}
                isTransitioning={isTransitioning}
                isActive={activeShutter === 2}
                verifyingMilestone={verifyingMilestone}
                releasingMilestone={releasingMilestone}
                handleVerifySingle={handleVerifySingle}
                handleManualRelease={handleManualRelease}
                languages={LANGUAGES}
                displayLang={displayLang}
                canonicalLang={canonicalLang}
                translating={translating}
                translatedMilestonesPresent={!!translatedMilestones}
                handleLanguageChange={handleLanguageChange}
                sendingProject={sendingProject}
                sendModalOpen={sendModalOpen}
                setSendModalOpen={setSendModalOpen}
                handleSendProject={handleSendProject}
              />
            )}
          </div>
        );
      })}

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{width:100%;height:100%;margin:0;padding:0;overflow:hidden}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        .spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:3px}
        input::placeholder,textarea::placeholder{color:#9ca3af}
        input:focus,textarea:focus{outline:none;border-color:#0f7173 !important;box-shadow:0 0 0 3px rgba(15,113,115,.1)}
        select:focus{outline:none;border-color:#0f7173 !important;box-shadow:0 0 0 3px rgba(15,113,115,.1)}
        button:hover:not(:disabled){filter:brightness(0.97);transform:translateY(-1px)}
        button:active:not(:disabled){transform:translateY(0)}
      `}</style>
    </div>
  );
}
