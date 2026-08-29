import React, { useState, useMemo } from "react";
import {
  Table,
  TableHeader,
  TableHeaderRow,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  TableFooter,
  TableFooterRow,
  TableFooterCell,
  TableToolbar,
  TableToolbarActions,
  Box,
  Text,
  Heading,
  Badge,
  Button,
  IconButton,
  Amount,
  Code,
  SearchInput,
  Chip,
  ChipGroup,
  EyeIcon,
  DownloadIcon,
  BookIcon,
  BuildingIcon,
  CreditCardIcon,
  SparklesIcon,
  RefreshIcon,
  AlertTriangleIcon,
} from "@razorpay/blade/components";
import { DiffInspectorSheet } from "./DiffInspectorSheet";
import type { FinRecord, Outcome } from "@/types";

interface ReconLedgerViewProps {
  records: FinRecord[];
  outcomes: Outcome[];
  selectedTierFilter: number | string | null;
  onSelectTierFilter: (tier: number | string | null) => void;
  onExplainMatch: (recordId: string) => void;
  onExportCsv: () => void;
}

type SortField = "id" | "date" | "amount" | "source" | "status";
type SortOrder = "asc" | "desc";

export const ReconLedgerView: React.FC<ReconLedgerViewProps> = ({
  records,
  outcomes,
  selectedTierFilter,
  onSelectTierFilter,
  onExplainMatch,
  onExportCsv,
}) => {
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Selected item for diff inspection sheet
  const [inspectTarget, setInspectTarget] = useState<FinRecord | null>(null);
  const [inspectOutcome, setInspectOutcome] = useState<Outcome | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Outcome lookup map
  const outcomeMap = useMemo(() => {
    const map = new Map<string, Outcome>();
    for (const o of outcomes) {
      map.set(o.recordId, o);
    }
    return map;
  }, [outcomes]);

  // Combined Rows
  const allRows = useMemo(() => {
    return records.map((record) => ({
      record,
      outcome: outcomeMap.get(record.id) || null,
    }));
  }, [records, outcomeMap]);

  // Filtered Rows
  const filteredRows = useMemo(() => {
    return allRows.filter(({ record, outcome }) => {
      // Status Filter
      if (statusFilter === "matched" && outcome?.status !== "matched") return false;
      if (statusFilter === "exception" && outcome?.status !== "exception") return false;

      // Tier Filter
      if (selectedTierFilter !== null) {
        if (selectedTierFilter === "exception" && outcome?.status !== "exception") return false;
        if (
          typeof selectedTierFilter === "number" &&
          (outcome?.status !== "matched" || outcome.tier !== selectedTierFilter)
        )
          return false;
      }

      // Source Filter
      if (sourceFilter !== "all" && record.source !== sourceFilter) return false;

      // Search Query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchId = record.id.toLowerCase().includes(q);
        const matchDesc = record.description.toLowerCase().includes(q);
        const matchRef = record.reference?.toLowerCase().includes(q);
        const matchAmt = String(record.amount).includes(q);
        const matchedIds = outcome?.status === "matched" ? outcome.matchedIds : undefined;
        const matchCounterpart = matchedIds?.some((mid: string) => mid.toLowerCase().includes(q));
        if (!matchId && !matchDesc && !matchRef && !matchAmt && !matchCounterpart) {
          return false;
        }
      }

      return true;
    });
  }, [allRows, statusFilter, selectedTierFilter, sourceFilter, search]);

  // Sorted Rows
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let comp = 0;
      if (sortField === "amount") {
        comp = a.record.amount - b.record.amount;
      } else if (sortField === "date") {
        comp = a.record.date.localeCompare(b.record.date);
      } else if (sortField === "id") {
        comp = a.record.id.localeCompare(b.record.id);
      } else if (sortField === "source") {
        comp = (a.record.source || "").localeCompare(b.record.source || "");
      } else if (sortField === "status") {
        const stA = a.outcome?.status || "pending";
        const stB = b.outcome?.status || "pending";
        comp = stA.localeCompare(stB);
      }
      return sortOrder === "asc" ? comp : -comp;
    });
  }, [filteredRows, sortField, sortOrder]);

  // Pagination Slicing
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  // Aggregation Metrics
  const metrics = useMemo(() => {
    let totalAmt = 0;
    let matchedAmt = 0;
    let exceptionAmt = 0;
    let matchedCnt = 0;
    let exceptionCnt = 0;

    for (const { record, outcome } of filteredRows) {
      totalAmt += record.amount;
      if (outcome?.status === "matched") {
        matchedAmt += record.amount;
        matchedCnt += 1;
      } else if (outcome?.status === "exception") {
        exceptionAmt += record.amount;
        exceptionCnt += 1;
      }
    }

    return { totalAmt, matchedAmt, exceptionAmt, matchedCnt, exceptionCnt };
  }, [filteredRows]);

  const handleInspect = (record: FinRecord, outcome: Outcome | null) => {
    setSelectedRowId(record.id);
    setInspectTarget(record);
    setInspectOutcome(outcome);
    setIsInspectorOpen(true);
  };

  const getSourceIcon = (src?: string) => {
    switch (src) {
      case "bank":
        return BuildingIcon;
      case "processor":
        return CreditCardIcon;
      case "ledger":
      default:
        return BookIcon;
    }
  };

  const getCounterparts = (outcome: Outcome | null): FinRecord[] => {
    if (!outcome || outcome.status !== "matched" || !outcome.matchedIds) return [];
    return outcome.matchedIds
      .map((id: string) => records.find((r: FinRecord) => r.id === id))
      .filter((r): r is FinRecord => !!r);
  };

  const handleResetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setSourceFilter("all");
    onSelectTierFilter(null);
    setPage(1);
  };

  return (
    <Box display="flex" flexDirection="column" gap="spacing.4">
      {/* Top Header */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        paddingBottom="spacing.3"
        borderBottomWidth="thin"
        borderBottomStyle="solid"
        borderBottomColor="surface.border.gray.subtle"
      >
        <Box display="flex" alignItems="center" gap="spacing.3">
          <Heading size="medium">
            Reconciliation ledger
          </Heading>
          <Badge color="primary" size="small">
            {`${filteredRows.length} records`}
          </Badge>
          {selectedTierFilter !== null && (
            <Badge color="neutral" size="small">
              {`Filter: ${selectedTierFilter === "exception" ? "Exceptions" : `Tier ${selectedTierFilter}`}`}
            </Badge>
          )}
        </Box>

        <Box display="flex" alignItems="center" gap="spacing.2">
          <Button
            variant="tertiary"
            size="small"
            icon={RefreshIcon}
            iconPosition="left"
            onClick={handleResetFilters}
            accessibilityLabel="Reset all active filters"
          >
            Reset filters
          </Button>
          <Button
            variant="secondary"
            size="small"
            icon={DownloadIcon}
            iconPosition="left"
            onClick={onExportCsv}
            accessibilityLabel="Export exception ledger to CSV"
          >
            Export CSV
          </Button>
        </Box>
      </Box>

      {/* Summary Strip */}
      <Box
        paddingX="spacing.4"
        paddingY="spacing.3"
        borderRadius="medium"
        backgroundColor="surface.background.gray.intense"
        borderWidth="thin"
        borderStyle="solid"
        borderColor="surface.border.gray.subtle"
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap="spacing.3"
      >
        <Box display="flex" alignItems="center" gap="spacing.4" flexWrap="wrap">
          <Box display="flex" alignItems="center" gap="spacing.2">
            <Text size="small" color="surface.text.gray.muted">
              Matched:
            </Text>
            <Text size="small" weight="semibold" color="feedback.text.positive.intense">
              {metrics.matchedCnt} items
            </Text>
            <Amount
              value={metrics.matchedAmt}
              currency="INR"
              size="small"
              weight="semibold"
            />
          </Box>

          <Box width="1px" height="14px" backgroundColor="surface.background.gray.subtle" />

          <Box display="flex" alignItems="center" gap="spacing.2">
            <Text size="small" color="surface.text.gray.muted">
              Exceptions:
            </Text>
            <Badge
              color={metrics.exceptionCnt === 0 ? "positive" : "notice"}
              size="small"
              emphasis="subtle"
            >
              {`${metrics.exceptionCnt} items`}
            </Badge>
            <Amount
              value={metrics.exceptionAmt}
              currency="INR"
              size="small"
              weight="semibold"
            />
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap="spacing.2">
          <Text size="xsmall" color="surface.text.gray.muted">
            Total volume:
          </Text>
          <Amount
            value={metrics.totalAmt}
            currency="INR"
            size="small"
            weight="semibold"
          />
        </Box>
      </Box>

      {/* Search & Filter Toolbar */}
      <Box
        padding="spacing.4"
        borderRadius="medium"
        backgroundColor="surface.background.gray.intense"
        borderWidth="thin"
        borderStyle="solid"
        borderColor="surface.border.gray.subtle"
        display="flex"
        flexDirection={{ base: "column", l: "row" }}
        alignItems={{ base: "stretch", l: "center" }}
        justifyContent="space-between"
        gap="spacing.4"
      >
        <Box display="flex" flex="1" alignItems="center" gap="spacing.3" flexWrap="wrap">
          <Box width={{ base: "100%", m: "340px" }}>
            <SearchInput
              placeholder="Search ID, description, reference, or amount..."
              value={search}
              onChange={({ value }) => {
                setSearch(value ?? "");
                setPage(1);
              }}
              accessibilityLabel="Search financial records in ledger"
            />
          </Box>

          {/* Source Chips */}
          <ChipGroup
            accessibilityLabel="Filter by source system"
            selectionType="single"
            value={sourceFilter}
            onChange={({ values }) => {
              setSourceFilter(values[0] || "all");
              setPage(1);
            }}
            size="small"
          >
            <Chip value="all">All sources</Chip>
            <Chip value="ledger">Ledger</Chip>
            <Chip value="processor">Processor</Chip>
            <Chip value="bank">Bank</Chip>
          </ChipGroup>
        </Box>

        {/* Status Filter Chips & Tier Tag */}
        <Box display="flex" alignItems="center" gap="spacing.3" flexWrap="wrap">
          <ChipGroup
            accessibilityLabel="Filter records by reconciliation status"
            selectionType="single"
            value={statusFilter}
            onChange={({ values }) => {
              setStatusFilter(values[0] || "all");
              setPage(1);
            }}
            size="small"
          >
            <Chip value="all">All status</Chip>
            <Chip value="matched">Matched</Chip>
            <Chip value="exception">Exceptions</Chip>
          </ChipGroup>

          {selectedTierFilter !== null && (
            <Box display="flex" alignItems="center" gap="spacing.2">
              <Badge color="primary" size="medium">
                {`Tier: ${selectedTierFilter === "exception" ? "Exceptions" : `T${selectedTierFilter}`}`}
              </Badge>
              <Button
                variant="tertiary"
                size="xsmall"
                onClick={() => onSelectTierFilter(null)}
                accessibilityLabel="Clear tier filter"
              >
                Clear
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* Blade Table Container */}
      <Box
        borderRadius="medium"
        backgroundColor="surface.background.gray.intense"
        borderWidth="thin"
        borderStyle="solid"
        borderColor="surface.border.gray.subtle"
        overflow="hidden"
      >
        <Table
          data={{
            nodes: paginatedRows.map((r) => ({
              id: r.record.id,
              ...r,
            })),
          }}
          rowDensity="comfortable"
          showStripedRows
          toolbar={
            <TableToolbar
              title="Transaction ledger"
              selectedTitle={`${filteredRows.length} records loaded`}
            >
              <TableToolbarActions>
                <Box display="flex" alignItems="center" gap="spacing.2">
                  <Text size="small" color="surface.text.gray.muted">
                    Page size:
                  </Text>
                  <Button
                    variant={pageSize === 10 ? "secondary" : "tertiary"}
                    size="xsmall"
                    onClick={() => {
                      setPageSize(10);
                      setPage(1);
                    }}
                  >
                    10
                  </Button>
                  <Button
                    variant={pageSize === 15 ? "secondary" : "tertiary"}
                    size="xsmall"
                    onClick={() => {
                      setPageSize(15);
                      setPage(1);
                    }}
                  >
                    15
                  </Button>
                  <Button
                    variant={pageSize === 30 ? "secondary" : "tertiary"}
                    size="xsmall"
                    onClick={() => {
                      setPageSize(30);
                      setPage(1);
                    }}
                  >
                    30
                  </Button>
                </Box>
              </TableToolbarActions>
            </TableToolbar>
          }
        >
          {() => (
            <>
              <TableHeader>
                <TableHeaderRow>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Tier</TableHeaderCell>
                  <TableHeaderCell>Record ID</TableHeaderCell>
                  <TableHeaderCell>Source</TableHeaderCell>
                  <TableHeaderCell>Posting date</TableHeaderCell>
                  <TableHeaderCell textAlign="right">Gross amount</TableHeaderCell>
                  <TableHeaderCell>Description & reference</TableHeaderCell>
                  <TableHeaderCell>Counterparts / Reason</TableHeaderCell>
                  <TableHeaderCell textAlign="center">Actions</TableHeaderCell>
                </TableHeaderRow>
              </TableHeader>

              <TableBody>
                {paginatedRows.length === 0 ? (
                  <TableRow item={{ id: "empty" }}>
                    <TableCell gridColumnStart={1} gridColumnEnd={10}>
                      <Box padding="spacing.8" textAlign="center">
                        <Box display="flex" flexDirection="column" alignItems="center" gap="spacing.3">
                          <AlertTriangleIcon size="large" color="feedback.icon.notice.intense" />
                          <Heading size="small">
                            No records found
                          </Heading>
                          <Text size="small" color="surface.text.gray.muted">
                            No transactions match the selected filters.
                          </Text>
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={handleResetFilters}
                            accessibilityLabel="Reset filters to view all records"
                          >
                            Clear filters
                          </Button>
                        </Box>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map(({ record, outcome }) => {
                    const isMatched = outcome?.status === "matched";
                    const tier = outcome?.tier;
                    const counterparts = getCounterparts(outcome);
                    const SourceIcon = getSourceIcon(record.source);

                    return (
                      <TableRow
                        key={record.id}
                        item={{ id: record.id, record, outcome }}
                        onClick={() => handleInspect(record, outcome)}
                        hoverActions={
                          <Box display="flex" alignItems="center" gap="spacing.2">
                            <Button
                              variant="tertiary"
                              size="xsmall"
                              icon={EyeIcon}
                              iconPosition="left"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInspect(record, outcome);
                              }}
                              accessibilityLabel="Inspect diff"
                            >
                              Inspect
                            </Button>
                          </Box>
                        }
                      >
                        {/* Status */}
                        <TableCell>
                          {outcome ? (
                            <Badge
                              color={isMatched ? "positive" : "negative"}
                              size="medium"
                              emphasis="subtle"
                            >
                              {isMatched ? "Matched" : "Exception"}
                            </Badge>
                          ) : (
                            <Badge color="neutral" size="medium">
                              Pending
                            </Badge>
                          )}
                        </TableCell>

                        {/* Tier */}
                        <TableCell>
                          {tier ? (
                            <Badge color="primary" size="small" emphasis="subtle">
                              {`T${tier}`}
                            </Badge>
                          ) : (
                            <Text size="small" color="surface.text.gray.muted">
                              —
                            </Text>
                          )}
                        </TableCell>

                        {/* Record ID */}
                        <TableCell>
                          <Code size="medium">{record.id}</Code>
                        </TableCell>

                        {/* Source */}
                        <TableCell>
                          <Box display="flex" alignItems="center" gap="spacing.2">
                            <SourceIcon size="small" color="surface.icon.gray.muted" />
                            <Text size="small" weight="medium">
                              {record.source ? record.source.charAt(0).toUpperCase() + record.source.slice(1) : "—"}
                            </Text>
                          </Box>
                        </TableCell>

                        {/* Posting Date */}
                        <TableCell>
                          <Text size="small" color="surface.text.gray.normal">
                            {record.date}
                          </Text>
                        </TableCell>

                        {/* Gross Amount */}
                        <TableCell textAlign="right">
                          <Amount
                            value={record.amount}
                            currency={record.currency as any}
                            size="small"
                            weight="semibold"
                          />
                        </TableCell>

                        {/* Description & Reference */}
                        <TableCell>
                          <Box maxWidth="300px">
                            <Text size="small" weight="medium" truncateAfterLines={1}>
                              {record.description}
                            </Text>
                            <Text size="small" color="surface.text.gray.muted" truncateAfterLines={1}>
                              Ref: {record.reference || "None"}
                            </Text>
                          </Box>
                        </TableCell>

                        {/* Counterparts / Reason */}
                        <TableCell>
                          {isMatched ? (
                            <Box display="flex" alignItems="center" gap="spacing.1" flexWrap="wrap">
                              {counterparts.map((cp) => (
                                <Code key={cp.id} size="small">
                                  {cp.id}
                                </Code>
                              ))}
                              {counterparts.length === 0 && (
                                <Code size="small">
                                  {outcome.matchedIds?.join(", ") || "Matched"}
                                </Code>
                              )}
                            </Box>
                          ) : outcome ? (
                            <Badge color="negative" size="small" emphasis="subtle">
                              {String(outcome.reasonCode || "EXCEPTION")}
                            </Badge>
                          ) : (
                            <Text size="small" color="surface.text.gray.muted">
                              —
                            </Text>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell textAlign="center">
                          <Box display="flex" alignItems="center" justifyContent="center" gap="spacing.2">
                            <IconButton
                              icon={EyeIcon}
                              accessibilityLabel="Inspect field diffs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInspect(record, outcome);
                              }}
                            />
                            <IconButton
                              icon={SparklesIcon}
                              accessibilityLabel="Explain match in AI controller"
                              onClick={(e) => {
                                e.stopPropagation();
                                onExplainMatch(record.id);
                              }}
                            />
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>

              <TableFooter>
                <TableFooterRow>
                  <TableFooterCell>Total</TableFooterCell>
                  <TableFooterCell>-</TableFooterCell>
                  <TableFooterCell>-</TableFooterCell>
                  <TableFooterCell>-</TableFooterCell>
                  <TableFooterCell>-</TableFooterCell>
                  <TableFooterCell textAlign="right">
                    <Amount
                      value={metrics.totalAmt}
                      currency="INR"
                      size="small"
                      weight="semibold"
                    />
                  </TableFooterCell>
                  <TableFooterCell>-</TableFooterCell>
                  <TableFooterCell>-</TableFooterCell>
                  <TableFooterCell>-</TableFooterCell>
                </TableFooterRow>
              </TableFooter>
            </>
          )}
        </Table>

        {/* Pagination & Summary Bar */}
        <Box
          paddingX="spacing.5"
          paddingY="spacing.4"
          borderTopWidth="thin"
          borderTopStyle="solid"
          borderTopColor="surface.border.gray.subtle"
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          backgroundColor="surface.background.gray.subtle"
          flexWrap="wrap"
          gap="spacing.3"
        >
          <Text size="small" color="surface.text.gray.muted">
            Showing <Text as="span" weight="semibold" color="surface.text.gray.normal">
              {filteredRows.length > 0 ? (page - 1) * pageSize + 1 : 0}
            </Text> to <Text as="span" weight="semibold" color="surface.text.gray.normal">
              {Math.min(page * pageSize, filteredRows.length)}
            </Text> of <Text as="span" weight="semibold" color="surface.text.gray.normal">
              {filteredRows.length}
            </Text> records
          </Text>

          <Box display="flex" alignItems="center" gap="spacing.2">
            <Button
              variant="secondary"
              size="small"
              isDisabled={page <= 1}
              onClick={() => setPage(1)}
              accessibilityLabel="First page"
            >
              First
            </Button>
            <Button
              variant="tertiary"
              size="small"
              isDisabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              accessibilityLabel="Previous page"
            >
              Previous
            </Button>
            <Badge size="medium" color="neutral">
              {`Page ${page} of ${totalPages}`}
            </Badge>
            <Button
              variant="tertiary"
              size="small"
              isDisabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              accessibilityLabel="Next page"
            >
              Next
            </Button>
            <Button
              variant="secondary"
              size="small"
              isDisabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              accessibilityLabel="Last page"
            >
              Last
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Slide-over Diff Inspector Drawer */}
      <DiffInspectorSheet
        open={isInspectorOpen}
        onOpenChange={setIsInspectorOpen}
        outcome={inspectOutcome}
        targetRecord={inspectTarget}
        counterparts={getCounterparts(inspectOutcome)}
        onExplainMatch={(id) => {
          setIsInspectorOpen(false);
          onExplainMatch(id);
        }}
      />
    </Box>
  );
};
