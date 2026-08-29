import React, { useEffect, useState, useMemo } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Box,
  Text,
  SearchInput,
  ActionList,
  ActionListItem,
  ActionListSection,
  Badge,
  LayoutIcon,
  SubscriptionsIcon,
  AcceptPaymentsIcon,
  BuildingIcon,
  RazorpayXIcon,
  AwardIcon,
  ActivityIcon,
  PlayIcon,
  DownloadIcon,
  ChevronRightIcon,
  TrendingUpIcon,
} from "@razorpay/blade/components";
import type { NavTab } from "./Sidebar";
import type { FinRecord } from "@/types";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTab: (tab: NavTab) => void;
  onSelectDataset: (dataset: string) => void;
  onRunPipeline: () => void;
  onExportCsv: () => void;
  records: FinRecord[];
  onSelectRecord?: (record: FinRecord) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  onSelectTab,
  onSelectDataset,
  onRunPipeline,
  onExportCsv,
  records,
  onSelectRecord,
}) => {
  const [search, setSearch] = useState("");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const runAndClose = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  const navItems = [
    {
      id: "dashboard" as NavTab,
      title: "Executive Overview & Metrics",
      icon: LayoutIcon,
      subtitle: "Recon fitness, cascade breakdown, and KPI summary",
    },
    {
      id: "analytics" as NavTab,
      title: "BKlit Visual Analytics Hub",
      icon: TrendingUpIcon,
      subtitle: "Financial distributions, cash variance, and telemetry charts",
    },
    {
      id: "ledger" as NavTab,
      title: "Reconciliation Ledger & Diff Inspector",
      icon: SubscriptionsIcon,
      subtitle: "Side-by-side transaction comparison & field diffs",
    },
    {
      id: "razorpay" as NavTab,
      title: "Razorpay Gateway & Checkout",
      icon: AcceptPaymentsIcon,
      subtitle: "Standard Web Checkout SDK, Orders, Payments, MDR deduction",
    },
    {
      id: "brs" as NavTab,
      title: "Bank Reconciliation Statement (BRS)",
      icon: BuildingIcon,
      subtitle: "Multi-currency cash balances & double-entry clearing",
    },
    {
      id: "controller" as NavTab,
      title: "Autonomous AI Finance Controller",
      icon: RazorpayXIcon,
      subtitle: "Multi-step tool reasoning & HITL approval guardrails",
    },
    {
      id: "crossval" as NavTab,
      title: "Multi-Seed Cross Validation",
      icon: AwardIcon,
      subtitle: "Generalization matrix across unseen populations",
    },
    {
      id: "traces" as NavTab,
      title: "Cryptographic Reasoning Traces",
      icon: ActivityIcon,
      subtitle: "JSONL audit logs, execution duration, and tool evidence",
    },
  ];

  const datasets = [
    { id: "data", title: "Dev Benchmark (Seed 42)", badge: "Dev 1.0000" },
    { id: "data/holdout", title: "Holdout Blind (Seed 777)", badge: "Holdout 1.0000" },
    { id: "data/hard", title: "Hard Edge-Cases (Seed 999)", badge: "Hard Seed" },
    { id: "data/adversarial", title: "Adversarial Evaluation (Seed 2026)", badge: "Stress Test" },
    { id: "data/razorpay", title: "Razorpay Ingestion Dataset", badge: "50+ Recs" },
  ];

  const filteredNav = useMemo(() => {
    if (!search.trim()) return navItems;
    const q = search.toLowerCase();
    return navItems.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.subtitle.toLowerCase().includes(q)
    );
  }, [search]);

  const filteredDatasets = useMemo(() => {
    if (!search.trim()) return datasets;
    const q = search.toLowerCase();
    return datasets.filter((d) => d.title.toLowerCase().includes(q));
  }, [search]);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records.slice(0, 5);
    const q = search.toLowerCase();
    return records
      .filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.reference.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [records, search]);

  return (
    <Modal
      isOpen={open}
      onDismiss={() => onOpenChange(false)}
      size="medium"
      accessibilityLabel="Global Recon Command Palette"
    >
      <ModalHeader
        title="Command Palette & Quick Search"
        subtitle="Navigate views, execute workflows, or inspect records (⌘K)"
      />
      <ModalBody>
        <Box display="flex" flexDirection="column" gap="spacing.4">
          <SearchInput
            placeholder="Search commands, tools, datasets, or records..."
            value={search}
            onChange={({ value }) => setSearch(value ?? "")}
            onClearButtonClick={() => setSearch("")}
            accessibilityLabel="Search commands or records"
            autoFocus
          />

          <Box maxHeight="360px" overflow="auto">
            <ActionList>
              {/* Navigation Section */}
              <ActionListSection title="Navigation">
                {filteredNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <ActionListItem
                      key={item.id}
                      title={item.title}
                      description={item.subtitle}
                      leading={<Icon size="medium" color="interactive.icon.primary.subtle" />}
                      trailing={<ChevronRightIcon size="small" color="surface.icon.gray.muted" />}
                      onClick={() => runAndClose(() => onSelectTab(item.id))}
                      value={item.id}
                    />
                  );
                })}
              </ActionListSection>

              {/* Actions Section */}
              <ActionListSection title="Recon Actions">
                <ActionListItem
                  title="Execute Reconciliation Cascade"
                  description="Run deterministic T1, rule-based T2, and LLM controller T3"
                  leading={<PlayIcon size="medium" color="feedback.icon.positive.intense" />}
                  onClick={() => runAndClose(onRunPipeline)}
                  value="run-cascade"
                />
                <ActionListItem
                  title="Export Exception Ledger CSV"
                  description="Download filtered unresolved exception report"
                  leading={<DownloadIcon size="medium" color="interactive.icon.primary.subtle" />}
                  onClick={() => runAndClose(onExportCsv)}
                  value="export-csv"
                />
              </ActionListSection>

              {/* Datasets Section */}
              <ActionListSection title="Switch Dataset Scope">
                {filteredDatasets.map((d) => (
                  <ActionListItem
                    key={d.id}
                    title={d.title}
                    trailing={<Badge size="small" color="neutral">{String(d.badge)}</Badge>}
                    onClick={() => runAndClose(() => onSelectDataset(d.id))}
                    value={d.id}
                  />
                ))}
              </ActionListSection>

              {/* Recent Records Section */}
              {filteredRecords.length > 0 && (
                <ActionListSection title="Financial Records">
                  {filteredRecords.map((rec) => (
                    <ActionListItem
                      key={rec.id}
                      title={`${rec.id} — ${rec.currency} ${rec.amount}`}
                      description={`${rec.description} (Ref: ${rec.reference || "None"})`}
                      onClick={() =>
                        runAndClose(() => {
                          onSelectTab("ledger");
                          onSelectRecord?.(rec);
                        })
                      }
                      value={rec.id}
                    />
                  ))}
                </ActionListSection>
              )}
            </ActionList>
          </Box>
        </Box>
      </ModalBody>
    </Modal>
  );
};
