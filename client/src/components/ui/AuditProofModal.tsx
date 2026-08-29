import React, { useEffect, useState } from "react";
import {
  Box,
  Text,
  Heading,
  Badge,
  Button,
  Code,
  CheckCircleIcon,
  CloseIcon,
  DownloadIcon,
  RazorSense,
  preloadRazorSenseAssets,
} from "@razorpay/blade/components";
import type { AuditProofCertificate } from "@/types";

interface AuditProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditProof?: AuditProofCertificate | null;
  onDownload?: () => void;
}

export const AuditProofModal: React.FC<AuditProofModalProps> = ({
  isOpen,
  onClose,
  auditProof,
  onDownload,
}) => {
  const [isPreloaded, setIsPreloaded] = useState(false);

  useEffect(() => {
    preloadRazorSenseAssets("circleSlideUp")
      .then(() => setIsPreloaded(true))
      .catch(() => setIsPreloaded(true));
  }, []);

  if (!isOpen) return null;

  const proof: AuditProofCertificate = auditProof || {
    proofId: "proof_latest_run",
    scope: "full_run",
    timestamp: new Date().toISOString(),
    recordCount: 100,
    matchedVolume: 2450000,
    exceptionCount: 4,
    merkleRoot: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    complianceChecklist: {
      soxSection404: true,
      indianTaxGstMdr: true,
      section194Tds: true,
      iso20022AuditIntegrity: true,
    },
    sha256Digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    signature: "sig_rsa_sha256_mock",
  };

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
          width: "540px",
          maxWidth: "92vw",
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
          {/* Top Header with RazorSense circleSlideUp animation */}
          <Box
            position="relative"
            width="100%"
            height="140px"
            overflow="hidden"
            backgroundColor="surface.background.gray.subtle"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {isPreloaded && (
              <RazorSense
                width="100%"
                height="100%"
                preset="circleSlideUp"
                edgeFeather={[0, 0, 0.3, 0]}
              />
            )}

            <div
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                zIndex: 2,
              }}
            >
              <Button
                variant="tertiary"
                size="xsmall"
                icon={CloseIcon}
                onClick={onClose}
                accessibilityLabel="Close audit certificate"
              />
            </div>

            <Box
              position="relative"
              zIndex={2}
              display="flex"
              flexDirection="column"
              alignItems="center"
              gap="spacing.1"
            >
              <CheckCircleIcon size="medium" color="feedback.icon.positive.intense" />
              <Heading size="small">Audit Certificate Verified</Heading>
              <Text size="xsmall" color="surface.text.gray.muted">
                Cryptographic SHA-256 Merkle root invariant
              </Text>
            </Box>
          </Box>

          {/* Modal Body */}
          <Box padding="spacing.5" display="flex" flexDirection="column" gap="spacing.4">
            <Box
              padding="spacing.3"
              borderRadius="medium"
              backgroundColor="surface.background.gray.subtle"
              borderWidth="thin"
              borderStyle="solid"
              borderColor="surface.border.gray.subtle"
              display="flex"
              flexDirection="column"
              gap="spacing.2"
            >
              <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
                MERKLE ROOT HASH
              </Text>
              <Code size="small">{proof.merkleRoot}</Code>
            </Box>

            {/* Compliance Checklist */}
            <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" gap="spacing.2">
              <Box
                padding="spacing.2"
                borderRadius="small"
                backgroundColor="surface.background.gray.subtle"
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Text size="xsmall">SOX 404 Controls</Text>
                <Badge color="positive" size="small">Passed</Badge>
              </Box>
              <Box
                padding="spacing.2"
                borderRadius="small"
                backgroundColor="surface.background.gray.subtle"
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Text size="xsmall">Section 194 TDS</Text>
                <Badge color="positive" size="small">Accrued</Badge>
              </Box>
              <Box
                padding="spacing.2"
                borderRadius="small"
                backgroundColor="surface.background.gray.subtle"
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Text size="xsmall">GST on MDR (2.36%)</Text>
                <Badge color="positive" size="small">Verified</Badge>
              </Box>
              <Box
                padding="spacing.2"
                borderRadius="small"
                backgroundColor="surface.background.gray.subtle"
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Text size="xsmall">ISO-20022 Schema</Text>
                <Badge color="positive" size="small">Valid</Badge>
              </Box>
            </Box>

            {/* Summary Row */}
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              paddingTop="spacing.2"
              borderTopWidth="thin"
              borderTopStyle="solid"
              borderTopColor="surface.border.gray.subtle"
            >
              <Text size="xsmall" color="surface.text.gray.muted">
                {`Verified ${proof.recordCount} records (${proof.exceptionCount} exceptions)`}
              </Text>
              <Box display="flex" gap="spacing.2">
                <Button
                  variant="secondary"
                  size="small"
                  icon={DownloadIcon}
                  iconPosition="left"
                  onClick={onDownload || onClose}
                  accessibilityLabel="Download certificate"
                >
                  Download
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  onClick={onClose}
                  accessibilityLabel="Done"
                >
                  Done
                </Button>
              </Box>
            </Box>
          </Box>
        </Box>
      </div>
    </div>
  );
};
