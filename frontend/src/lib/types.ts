export interface AcceptanceCriterion {
  description: string;
  evidence_type: "photo" | "receipt" | "document" | "video" | "screenshot";
  evidence_instruction: string;
}

export type TrustLevel = "high" | "medium" | "low" | "untrusted";

export type LayerStatus =
  | "authentic"
  | "verified"
  | "real"
  | "inconclusive"
  | "suspicious"
  | "ai_generated"
  | "invalid"
  | "no_data"
  | "no_manifest"
  | "unavailable"
  | "error"
  | "unknown";

export interface ProvenanceCheck {
  layer?: string;
  status: LayerStatus;
  score?: number | null;
  signals?: string[];
  camera?: { make?: string; model?: string; lens?: string } | null;
  gps?: { latitude: number; longitude: number } | null;
  timestamp?: string | null;
  software?: string | null;
  signer?: string | null;
  claimGenerator?: string | null;
  assertions?: unknown[];
  raw?: unknown;
}

export interface ProvenanceEntry {
  trust_level: TrustLevel;
  trust_summary: string;
  filename?: string;
  elapsed_ms?: number;
  checks?: Record<string, ProvenanceCheck>;
}

export interface Milestone {
  id: string;
  header: string;
  description: string;
  evidenceRequired: string;
  acceptance_criteria: AcceptanceCriterion[];
  verification_confidence: "high" | "medium" | "low";
  price: string;
  percentage: number;
  locked: boolean;
}

export interface DeploymentData {
  contractAddress: string;
  storageHash: string;
  deployTxHash: string;
  agentAddress?: string;
  chainScanUrl?: string;
  storageScanUrl?: string;
  escrowAmount?: string;
  agentReserve?: string;
}

export interface CriterionCheck {
  criterion: string;
  met: boolean;
  evidence_type_expected?: string;
  evidence_type_received?: string;
  note: string;
}

export interface VerificationResult {
  approved: boolean;
  reasoning: string;
  confidence?: number;
  criteria_check?: CriterionCheck[];
  provenance_assessment?: string | null;
  pricing_assessment?: string | null;
  paymentTxHash: string | null;
  provenance?: ProvenanceEntry[];
  evidenceHash: string | null;
  released?: boolean;
  amountReleased?: string;
  payee?: string;
  chainScanUrl?: string;
  agentGasRefunded?: string | null;
}

export interface PrepareProjectResponse {
  contract: {
    abi: unknown[];
    bytecode: string;
  };
  agentAddress: string;
  storageHash: string;
  storageScanUrl?: string;
}

export interface GenerateMilestonesResponse {
  milestones: Milestone[];
  canonical_language: string;
}

export interface TranslatedSpec {
  project_title?: string;
  project_summary?: string;
  milestones: Array<{
    name: string;
    description?: string;
    acceptance_criteria?: AcceptanceCriterion[];
    verification_confidence?: "high" | "medium" | "low";
    percentage?: number;
  }>;
}

export interface TranslateSpecResponse {
  spec: TranslatedSpec;
}
