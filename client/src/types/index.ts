export interface FinRecord {
  id: string;
  source: "bank" | "ledger" | "processor";
  date: string;
  amount: number;
  currency: string;
  description: string;
  reference: string;
}

export type ReasonCode =
  | "exact_match"
  | "timing_gap"
  | "amount_variance"
  | "id_drift"
  | "many_to_one"
  | "one_to_many"
  | "duplicate_conflict"
  | "no_candidate_found"
  | "low_confidence"
  | "currency_mismatch"
  | "refund_reversal"
  | "partial_payment"
  | "model_error"
  | "collision_conflict"
  | "fee_drift"
  | "suspense_unmatched";

export interface AuditEvidence {
  field: string;
  recordAVal: string | number;
  recordBVal: string | number;
  similarity: number;
  explanation: string;
}

export interface AuditTrail {
  tier: 1 | 2 | 3;
  ruleTriggered: string;
  confidence: number;
  evidence: AuditEvidence[];
  timestamp?: string;
  modelUsed?: string;
}

export interface MatchedOutcome {
  status: "matched";
  recordId: string;
  source: string;
  matchedIds: string[];
  confidence: number;
  tier: 1 | 2 | 3;
  reasonCode?: ReasonCode;
  reasoning?: string;
  auditTrail?: AuditTrail;
}

export interface ExceptionOutcome {
  status: "exception";
  recordId: string;
  source: string;
  reasonCode: ReasonCode;
  tier: 1 | 2 | 3;
  candidatesConsidered: number;
  reasoning?: string;
  auditTrail?: AuditTrail;
}

export type Outcome = MatchedOutcome | ExceptionOutcome;

export interface BankReconciliationStatement {
  currency: string;
  openingBankBalance: number;
  clearedDeposits: number;
  clearedDisbursements: number;
  closingBankBalance: number;
  unreconciledInTransitDeposits: number;
  unreconciledOutstandingPayments: number;
  subledgerBalance: number;
  processorNodalBalance: number;
  statutoryAccrualsMdrTds: number;
  netVariance: number;
}

export interface CashPositionCurrency {
  currency: string;
  reconciledAmount: number;
  unreconciledAmount: number;
  netPosition: number;
  bankBalance?: number;
  internalLedgerBalance?: number;
  processorNodalBalance?: number;
  taxWithheldMdr?: number;
  inTransitVariance?: number;
  reconciledCount?: number;
  unreconciledCount?: number;
  reconciliationRate?: number;
  brs?: BankReconciliationStatement;
}

export interface RunResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  model: string;
  outcomes: Outcome[];
  inputManifest?: {
    file: string;
    source: string;
    totalRows: number;
    validRecords: number;
    sha256: string;
  }[];
  rejectedRecords?: {
    rawRecord: unknown;
    source: string;
    reason: string;
    file?: string;
  }[];
  cashPosition?: Record<string, CashPositionCurrency>;
  stats: {
    totalRecords: number;
    matched: number;
    exceptions: number;
    skippedInvalid?: number;
    tier3Calls: number;
    tier3Tokens: number;
    tier3CostUsd: number;
  };
}

export interface EvalReportItem {
  timestamp: string;
  fitness: number;
  recall: number;
  fpr: number;
  matchedPairs: number;
  groundTruthPairs: number;
  falsePositives: number;
  hash: string;
}

export interface ApiReportResponse {
  latest: EvalReportItem | null;
  history: EvalReportItem[];
  run: RunResult | null;
  running: boolean;
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
}

export interface ActionApprovalRequest {
  token: string;
  action: "force_match" | "mark_as_suspense";
  targetRecordId: string;
  counterpartRecordIds?: string[];
  suspenseAccount?: string;
  reason: string;
  status: "PENDING_HUMAN_CONFIRMATION";
  createdAt: string;
  amountVariance?: number;
  verifiableMathCheck?: boolean;
  details?: Record<string, unknown>;
}

export interface AuditProofCertificate {
  proofId: string;
  scope: "full_run" | "exceptions" | "matches";
  timestamp: string;
  recordCount: number;
  matchedVolume: number;
  exceptionCount: number;
  sha256Digest: string;
  merkleRoot: string;
  signature: string;
  complianceChecklist: {
    soxSection404: boolean;
    indianTaxGstMdr: boolean;
    section194Tds: boolean;
    iso20022AuditIntegrity: boolean;
  };
}

export interface AgentChatResponse {
  reply: string;
  suggestedActions?: string[];
  referencedRecords?: string[];
  insights?: string[];
  modelUsed: string;
  toolCalls?: ToolCallRecord[];
  approvalRequests?: ActionApprovalRequest[];
  auditProof?: AuditProofCertificate;
  traceId?: string;
}

export interface CrossValSeedSummary {
  seed: number;
  mode: string;
  fitness: number;
  recall: number;
  fpr: number;
  matchedCount: number;
  expectedCount: number;
  falsePositiveCount: number;
  durationMs: number;
}

export interface CrossValSummary {
  timestamp: string;
  runs: CrossValSeedSummary[];
  meanFitness: number;
  stdDevFitness: number;
  minFitness: number;
  maxFitness: number;
  generalizationPassed: boolean;
}

export interface ReasoningTraceItem {
  timestamp: string;
  targetRecordId: string;
  tier: number;
  candidatesCount: number;
  decision: {
    matchedIds: string[] | null;
    confidence: number;
    reasonCode: string;
    reasoning: string;
  };
  durationMs: number;
  model: string;
}
