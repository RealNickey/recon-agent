import React, { useState, useEffect } from "react";
import {
  SideNav,
  SideNavBody,
  SideNavSection,
  SideNavLink,
  SideNavFooter,
  Box,
  Text,
  Heading,
  Badge,
  Button,
  Counter,
  PlayIcon,
  ActivityIcon,
  BuildingIcon,
  LayoutIcon,
  RazorpayXIcon,
  SubscriptionsIcon,
  AwardIcon,
  RazorSense,
  preloadRazorSenseAssets,
} from "@razorpay/blade/components";

export type NavTab =
  | "dashboard"
  | "ledger"
  | "brs"
  | "controller"
  | "crossval"
  | "traces";

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  dataset: string;
  onSelectDataset: (dataset: string) => void;
  isRunning: boolean;
  onRunPipeline: () => void;
  pendingApprovalsCount: number;
}

const CustomLink = React.forwardRef<HTMLAnchorElement, any>(({ children, ...props }, ref) => (
  <a ref={ref} {...props}>
    {children}
  </a>
));

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  dataset,
  onSelectDataset,
  isRunning,
  onRunPipeline,
  pendingApprovalsCount,
}) => {
  const [isWavePreloaded, setIsWavePreloaded] = useState(false);

  useEffect(() => {
    preloadRazorSenseAssets("bottomWave")
      .then(() => setIsWavePreloaded(true))
      .catch(() => setIsWavePreloaded(true));
  }, []);

  const datasets = [
    { id: "data", label: "Dev benchmark", tag: "Seed 42" },
    { id: "data/holdout", label: "Holdout set", tag: "Seed 777" },
    { id: "data/hard", label: "Hard edge-cases", tag: "Seed 999" },
    { id: "data/adversarial", label: "Adversarial set", tag: "Seed 2026" },
  ];

  return (
    <Box
      as="aside"
      width="270px"
      minWidth="270px"
      maxWidth="270px"
      height="100vh"
      position="sticky"
      top="0px"
      zIndex={40}
    >
      <SideNav
        position="relative"
        backgroundColor="surface.background.gray.intense"
        testID="recon-sidebar"
        banner={
          <Box
            position="relative"
            width="100%"
            height="64px"
            overflow="hidden"
            borderBottomWidth="thin"
            borderBottomStyle="solid"
            borderBottomColor="surface.border.gray.subtle"
            backgroundColor="surface.background.gray.intense"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {isWavePreloaded && (
              <RazorSense
                width="100%"
                height="100%"
                preset="bottomWave"
                edgeFeather={[0.1, 0, 0, 0]}
              />
            )}
          </Box>
        }
      >
        <SideNavBody>
          <SideNavSection title="WORKSPACE">
            <SideNavLink
              as={CustomLink}
              title="Dashboard"
              icon={LayoutIcon}
              isActive={activeTab === "dashboard"}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                onSelectTab("dashboard");
              }}
            />
            <SideNavLink
              as={CustomLink}
              title="Reconciliation ledger"
              icon={SubscriptionsIcon}
              isActive={activeTab === "ledger"}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                onSelectTab("ledger");
              }}
            />
            <SideNavLink
              as={CustomLink}
              title="Bank statement & BRS"
              icon={BuildingIcon}
              isActive={activeTab === "brs"}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                onSelectTab("brs");
              }}
            />
          </SideNavSection>

          <SideNavSection title="INTELLIGENCE & AGENTS">
            <SideNavLink
              as={CustomLink}
              title="AI controller"
              icon={RazorpayXIcon}
              isActive={activeTab === "controller"}
              titleSuffix={
                pendingApprovalsCount > 0 ? (
                  <Counter value={pendingApprovalsCount} color="negative" emphasis="intense" />
                ) : undefined
              }
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                onSelectTab("controller");
              }}
            />
            <SideNavLink
              as={CustomLink}
              title="Cross-validation"
              icon={AwardIcon}
              isActive={activeTab === "crossval"}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                onSelectTab("crossval");
              }}
            />
            <SideNavLink
              as={CustomLink}
              title="Reasoning traces"
              icon={ActivityIcon}
              isActive={activeTab === "traces"}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                onSelectTab("traces");
              }}
            />
          </SideNavSection>

          <SideNavSection title="DATASETS">
            {datasets.map((d) => (
              <SideNavLink
                key={d.id}
                as={CustomLink}
                title={d.label}
                isActive={dataset === d.id}
                titleSuffix={
                  <Badge color={dataset === d.id ? "primary" : "neutral"} size="small" emphasis="subtle">
                    {d.tag}
                  </Badge>
                }
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  onSelectDataset(d.id);
                }}
              />
            ))}
          </SideNavSection>
        </SideNavBody>

        <SideNavFooter>
          <Box padding="spacing.3">
            <Button
              variant="primary"
              isFullWidth
              size="small"
              icon={PlayIcon}
              iconPosition="left"
              onClick={onRunPipeline}
              isLoading={isRunning}
              isDisabled={isRunning}
              accessibilityLabel="Run reconciliation engine"
            >
              {isRunning ? "Reconciling..." : "Run reconciliation"}
            </Button>
          </Box>
        </SideNavFooter>
      </SideNav>
    </Box>
  );
};
