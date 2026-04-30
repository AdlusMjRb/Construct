import type {
  AcceptanceCriterion,
  GenerateMilestonesResponse,
  Milestone,
  PrepareProjectResponse,
  TranslateSpecResponse,
  VerificationResult,
} from "./types";

const API_BASE = "/api";

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data && typeof data === "object" && "ok" in data && data.ok === false) {
    throw new Error(data.error || "Request failed");
  }
  if (data && typeof data === "object" && "ok" in data) {
    const { ok: _ok, ...rest } = data;
    return rest as T;
  }
  return data as T;
}

const jsonHeaders = { "Content-Type": "application/json" };

export async function apiGenerateMilestones(
  description: string,
  budget: string,
): Promise<GenerateMilestonesResponse> {
  const res = await fetch(`${API_BASE}/projects/generate`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ description }),
  });
  const data = await unwrap<{
    spec: {
      project_title?: string;
      project_summary?: string;
      total_budget?: string;
      canonical_language?: string;
      milestones: Array<{
        name: string;
        description?: string;
        acceptance_criteria?: Array<AcceptanceCriterion | string>;
        verification_confidence?: "high" | "medium" | "low";
        percentage: number;
      }>;
    };
    storage?: {
      rootHash: string;
      specSize: number;
      attempts: number;
    };
  }>(res);

  const total = parseFloat(budget) || 1;
  const milestones: Milestone[] = data.spec.milestones.map((m): Milestone => {
    const criteria: AcceptanceCriterion[] = (m.acceptance_criteria || []).map(
      (c) => {
        if (typeof c === "string") {
          return {
            description: c,
            evidence_type: "photo",
            evidence_instruction: c,
          };
        }
        return c;
      },
    );
    const evidenceRequired = criteria
      .map((c) => `[${c.evidence_type}] ${c.evidence_instruction}`)
      .join(" | ");

    return {
      id: crypto.randomUUID(),
      header: m.name,
      description: m.description || "",
      evidenceRequired,
      acceptance_criteria: criteria,
      verification_confidence: m.verification_confidence || "medium",
      price: ((total * m.percentage) / 100).toFixed(4),
      percentage: m.percentage,
      locked: false,
    };
  });

  return {
    milestones,
    canonical_language: data.spec.canonical_language || "en",
  };
}

// 1. Add userWallet to the apiPrepareProject params + body

export async function apiPrepareProject(params: {
  milestones: Milestone[];
  developerWallet: string;
  userWallet: string; // ← NEW
  projectTitle: string;
  projectSummary: string;
  totalBudget: string;
  canonicalLanguage: string;
}): Promise<PrepareProjectResponse> {
  const res = await fetch(`${API_BASE}/escrow/prepare`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      milestones: params.milestones.map((m) => ({
        name: m.header,
        description: m.description,
        acceptance_criteria: m.acceptance_criteria,
        verification_confidence: m.verification_confidence,
        percentage: m.percentage,
      })),
      developerWallet: params.developerWallet,
      userWallet: params.userWallet, // ← NEW
      projectTitle: params.projectTitle,
      projectSummary: params.projectSummary,
      totalBudget: params.totalBudget,
      canonical_language: params.canonicalLanguage,
    }),
  });
  return unwrap<PrepareProjectResponse>(res);
}

// 2. New function for mint-subname

export interface MintSubnameResponse {
  label: string;
  fullName: string;
  tokenId: string;
  ownerWallet: string;
  confirmedAt: string;
  elapsedMs: number;
  escrowAddress: string;
  sepoliaScanUrl: string;
}

export async function apiMintSubname(params: {
  escrowAddress: string;
  userWallet: string;
  projectTitle: string;
}): Promise<MintSubnameResponse> {
  const res = await fetch(`${API_BASE}/projects/mint-subname`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(params),
  });
  return unwrap<MintSubnameResponse>(res);
}

export interface SetRecordsResponse {
  subname: string;
  submitted: number;
  total: number;
  records: Array<{
    key: string;
    status: "submitted" | "failed";
    executionId?: string | null;
    error?: string;
  }>;
}

export async function apiSetRecords(params: {
  subname: string;
  escrowAddress: string;
  payeeAddress: string;
  milestoneCount: number;
}): Promise<SetRecordsResponse> {
  const res = await fetch(`${API_BASE}/projects/set-records`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(params),
  });
  return unwrap<SetRecordsResponse>(res);
}

export async function apiVerifyEvidence(params: {
  contractAddress: string;
  milestoneId: number;
  evidence: string;
  acceptance_criteria: AcceptanceCriterion[];
  verification_confidence: string;
  files: File[];
}): Promise<VerificationResult> {
  const formData = new FormData();
  formData.append("contractAddress", params.contractAddress);
  formData.append("milestoneId", params.milestoneId.toString());
  formData.append("evidence", params.evidence);
  formData.append(
    "milestone",
    JSON.stringify({
      name: `Milestone ${params.milestoneId + 1}`,
      acceptance_criteria: params.acceptance_criteria,
      verification_confidence: params.verification_confidence,
    }),
  );
  for (const file of params.files) formData.append("images", file);

  const res = await fetch(`${API_BASE}/evidence/verify`, {
    method: "POST",
    body: formData,
  });

  const data = await unwrap<{
    result: {
      verdict: "APPROVE" | "ESCALATE";
      reasoning: string;
      confidence?: number;
      criteria_check?: VerificationResult["criteria_check"];
      provenance_assessment?: string | null;
      pricing_assessment?: string | null;
      releaseTxHash?: string | null;
      released?: boolean;
      amountReleased?: string;
      payee?: string;
      chainScanUrl?: string;
      agentGasRefunded?: string | null;
    };
    provenance?: VerificationResult["provenance"];
  }>(res);

  return {
    approved: data.result.verdict === "APPROVE",
    reasoning: data.result.reasoning,
    confidence: data.result.confidence,
    criteria_check: data.result.criteria_check,
    provenance_assessment: data.result.provenance_assessment ?? null,
    pricing_assessment: data.result.pricing_assessment ?? null,
    provenance: data.provenance ?? [],
    paymentTxHash: data.result.releaseTxHash ?? null,
    evidenceHash: null,
    released: data.result.released,
    amountReleased: data.result.amountReleased,
    payee: data.result.payee,
    chainScanUrl: data.result.chainScanUrl,
    agentGasRefunded: data.result.agentGasRefunded ?? null,
  };
}

export async function apiTranslateSpec(
  spec: unknown,
  targetLang: string,
  canonicalLang: string,
): Promise<TranslateSpecResponse> {
  const res = await fetch(`${API_BASE}/translate`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      spec,
      targetLang,
      canonical_language: canonicalLang,
    }),
  });
  return unwrap<TranslateSpecResponse>(res);
}

export async function apiTranslateVerification(
  result: VerificationResult,
  targetLang: string,
  canonicalLang: string,
): Promise<VerificationResult> {
  const res = await fetch(`${API_BASE}/translate-verification`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      result,
      targetLang,
      canonical_language: canonicalLang,
    }),
  });
  const data = await unwrap<
    VerificationResult | { result: VerificationResult }
  >(res);
  return ("result" in data ? data.result : data) as VerificationResult;
}

export interface EscrowState {
  contractAddress: string;
  funded: boolean;
  budget: string;
  milestones: Array<{
    name: string;
    percentage: number;
    amount: string;
    completed: boolean;
    completedAt?: string | null;
  }>;
  payee?: string;
  agent?: string;
  storageHash?: string;
  isFullyComplete?: boolean;
  totalReleased?: string;
}

export async function apiGetEscrow(
  contractAddress: string,
): Promise<EscrowState> {
  const res = await fetch(`${API_BASE}/escrow/${contractAddress}`);
  return unwrap<EscrowState>(res);
}
