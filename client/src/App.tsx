import React, { useState, useEffect, useCallback } from "react";
import { Box } from "@razorpay/blade/components";
import { Sidebar, type NavTab } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { DashboardView } from "@/components/financial/DashboardView";
import { ReconLedgerView } from "@/components/ledger/ReconLedgerView";
import { BrsView } from "@/components/financial/BrsView";
import { AiControllerChatView } from "@/components/controller/AiControllerChatView";
import { CrossValMatrixView } from "@/components/telemetry/CrossValMatrixView";
import { ReasoningTracesView } from "@/components/telemetry/ReasoningTracesView";
import { ReconProcessModal } from "@/components/ui/ReconProcessModal";
import { AuditProofModal } from "@/components/ui/AuditProofModal";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import type { FinRecord, RunResult, ApiReportResponse, AuditProofCertificate } from "@/types";

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [dataset, setDataset] = useState<string>("data");
  const [report, setReport] = useState<ApiReportResponse | null>(null);
  const [records, setRecords] = useState<FinRecord[]>([]);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [selectedTierFilter, setSelectedTierFilter] = useState<number | string | null>(null);
  const [controllerPrompt, setControllerPrompt] = useState<string>("");
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [currentAuditProof, setCurrentAuditProof] = useState<AuditProofCertificate | null>(null);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch("/api/report");
      if (res.ok) {
        const data: ApiReportResponse = await res.json();
        setReport(data);
        if (data.run) {
          setRunResult(data.run);
        }
      }
    } catch {}
  }, []);

  // Fetch dataset records
  const fetchRecords = useCallback(async (dataDir: string) => {
    try {
      const res = await fetch(`/api/records?data=${encodeURIComponent(dataDir)}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch {}
  }, []);

  // Fetch pending approvals count
  const fetchApprovalsCount = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/pending-approvals");
      if (res.ok) {
        const data = await res.json();
        setPendingApprovalsCount(data.count || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchReport();
    fetchRecords(dataset);
    fetchApprovalsCount();
  }, [dataset, fetchReport, fetchRecords, fetchApprovalsCount]);

  // Run pipeline execution
  const handleRunPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataDir: dataset,
          useAi: true,
          outFile: "results/latest-run.json",
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }

      const result: RunResult = await res.json();
      setRunResult(result);
      toast.success(
        `Reconciliation complete in ${result.durationMs}ms with ${result.stats.matched} matched pairs.`
      );
      fetchReport();
      fetchRecords(dataset);
      fetchApprovalsCount();
    } catch (err: any) {
      toast.error(err.message || "Failed to execute reconciliation");
    } finally {
      setIsRunning(false);
    }
  };

  // Export exception CSV
  const handleExportCsv = () => {
    window.open("/api/exceptions/export", "_blank");
    toast.success("Downloading exception CSV...");
  };

  // Explain match action
  const handleExplainMatch = (recordId: string) => {
    setControllerPrompt(`explain_match for record ${recordId}`);
    setActiveTab("controller");
  };

  // Switch dataset
  const handleSelectDataset = (newDataset: string) => {
    setDataset(newDataset);
    fetchRecords(newDataset);
    toast.info(`Switched dataset: ${newDataset}`);
  };

  return (
    <Box
      display="flex"
      minHeight="100vh"
      backgroundColor="surface.background.gray.subtle"
    >
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== "controller") setControllerPrompt("");
        }}
        dataset={dataset}
        onSelectDataset={handleSelectDataset}
        isRunning={isRunning}
        onRunPipeline={handleRunPipeline}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      {/* Main Workspace Area */}
      <Box
        display="flex"
        flexDirection="column"
        flex="1"
        minWidth="0px"
        overflow="auto"
      >
        {/* Top Header */}
        <Header
          report={report}
          runResult={runResult}
          isRunning={isRunning}
          onRunPipeline={handleRunPipeline}
          dataset={dataset}
          onExportCsv={handleExportCsv}
        />

        {/* View Surface Container */}
        <Box
          as="main"
          flex="1"
          padding={{ base: "spacing.4", m: "spacing.7" }}
          maxWidth="1600px"
          width="100%"
          marginX="auto"
        >
          {activeTab === "dashboard" && (
            <DashboardView
              runResult={runResult}
              report={report}
              isRunning={isRunning}
              onRunPipeline={handleRunPipeline}
              onNavigate={(tab) => setActiveTab(tab)}
              onSelectTierFilter={(tier) => setSelectedTierFilter(tier)}
              selectedTier={selectedTierFilter}
            />
          )}

          {activeTab === "ledger" && (
            <ReconLedgerView
              records={records}
              outcomes={runResult?.outcomes || []}
              selectedTierFilter={selectedTierFilter}
              onSelectTierFilter={setSelectedTierFilter}
              onExplainMatch={handleExplainMatch}
              onExportCsv={handleExportCsv}
            />
          )}

          {activeTab === "brs" && <BrsView runResult={runResult} />}

          {activeTab === "controller" && (
            <AiControllerChatView
              initialPrompt={controllerPrompt}
              dataset={dataset}
              onRefreshApprovals={fetchApprovalsCount}
              onOpenAuditProof={(proof) => {
                if (proof) setCurrentAuditProof(proof);
                setIsAuditModalOpen(true);
              }}
            />
          )}

          {activeTab === "crossval" && <CrossValMatrixView />}

          {activeTab === "traces" && <ReasoningTracesView />}
        </Box>
      </Box>

      {/* Special RazorSense Ripple Wave Loader Modal */}
      <ReconProcessModal
        isOpen={isRunning}
        title="Reconciling transactions"
        subtitle={`Executing multi-tier settlement cascade on ${dataset}`}
        step="Evaluating exact keys, fuzzy tolerances, and double-entry invariants..."
        progress={72}
      />

      {/* RazorSense Circle Slide Up Audit Certificate Modal */}
      <AuditProofModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        auditProof={currentAuditProof}
        onDownload={() => {
          setIsAuditModalOpen(false);
          toast.success("Downloaded audit certificate");
        }}
      />

      {/* Sonner Toast Notifications */}
      <Toaster position="bottom-right" richColors />
    </Box>
  );
}

export default App;
