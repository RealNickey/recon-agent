import React, { useEffect, useState } from "react";
import {
  Box,
  Text,
  Heading,
  Badge,
  ProgressBar,
  RazorSense,
  preloadRazorSenseAssets,
} from "@razorpay/blade/components";

interface ReconProcessModalProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  step?: string;
  progress?: number;
}

export const ReconProcessModal: React.FC<ReconProcessModalProps> = ({
  isOpen,
  title = "Reconciling transactions",
  subtitle = "Evaluating multi-tier settlement rules and double-entry invariants",
  step = "Matching ledger records against statement lines...",
  progress = 65,
}) => {
  const [isPreloaded, setIsPreloaded] = useState(false);

  useEffect(() => {
    preloadRazorSenseAssets("rippleWave")
      .then(() => setIsPreloaded(true))
      .catch(() => setIsPreloaded(true));
  }, []);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(15, 23, 42, 0.72)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "480px",
          maxWidth: "90vw",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
        }}
      >
        <Box
          backgroundColor="surface.background.gray.intense"
          borderWidth="thin"
          borderStyle="solid"
          borderColor="surface.border.gray.subtle"
          borderRadius="large"
          overflow="hidden"
        >
          {/* Top RazorSense Ripple Wave Animation Banner */}
          <Box
            position="relative"
            width="100%"
            height="160px"
            overflow="hidden"
            backgroundColor="surface.background.gray.subtle"
          >
            {isPreloaded && (
              <RazorSense
                width="100%"
                height="100%"
                preset="rippleWave"
                edgeFeather={[0, 0, 0.4, 0]}
              />
            )}

            {/* Floating pill over animation */}
            <div
              style={{
                position: "absolute",
                top: "16px",
                left: "16px",
                zIndex: 2,
              }}
            >
              <Badge color="primary" size="small">
                Reconciliation engine
              </Badge>
            </div>
          </Box>

          {/* Content Body */}
          <Box padding="spacing.6" display="flex" flexDirection="column" gap="spacing.4">
            <Box>
              <Heading size="small">{title}</Heading>
              <Text size="small" color="surface.text.gray.muted" marginTop="spacing.1">
                {subtitle}
              </Text>
            </Box>

            <Box display="flex" flexDirection="column" gap="spacing.2">
              <ProgressBar
                value={progress}
                color="positive"
                size="medium"
                showPercentage={false}
                accessibilityLabel={title}
              />
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Text size="xsmall" color="surface.text.gray.subtle" truncateAfterLines={1}>
                  {step}
                </Text>
                <Text size="xsmall" weight="semibold" color="surface.text.primary.normal">
                  {`${progress}%`}
                </Text>
              </Box>
            </Box>
          </Box>
        </Box>
      </div>
    </div>
  );
};
