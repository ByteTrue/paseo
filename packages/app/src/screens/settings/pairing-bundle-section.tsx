import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as QRCode from "qrcode";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Copy, QrCode } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { useHosts } from "@/runtime/host-runtime";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { buildPairingBundleEntries, buildPairingBundleUrlFromHosts } from "@/utils/pairing-bundle";

const SHARE_HOSTS_HEADER: SheetHeader = { title: "Share hosts" };
const PAIRING_BUNDLE_SNAP_POINTS = ["82%", "94%"];

export function PairingBundleSection() {
  const { theme } = useUnistyles();
  const hosts = useHosts();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const shareableCount = buildPairingBundleEntries(hosts).length;

  const handleOpen = useCallback(() => setIsModalOpen(true), []);
  const handleClose = useCallback(() => setIsModalOpen(false), []);

  return (
    <SettingsSection title="Pair devices">
      <View style={settingsStyles.card}>
        <Pressable
          style={settingsStyles.row}
          onPress={handleOpen}
          accessibilityRole="button"
          testID="pairing-bundle-row"
        >
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Share hosts with another device</Text>
            <Text style={settingsStyles.rowHint}>
              {shareableCount > 0
                ? `${shareableCount} relay host${shareableCount === 1 ? "" : "s"} available`
                : "No relay hosts available"}
            </Text>
          </View>
          <ChevronRight size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      <PairingBundleModal visible={isModalOpen} onClose={handleClose} />
    </SettingsSection>
  );
}

function PairingBundleModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useUnistyles();
  const hosts = useHosts();
  const [copied, setCopied] = useState(false);
  const bundleUrl = useMemo(() => buildPairingBundleUrlFromHosts(hosts), [hosts]);
  const shareableCount = useMemo(() => buildPairingBundleEntries(hosts).length, [hosts]);

  const qrQuery = useQuery({
    queryKey: ["pairing-bundle-qr", bundleUrl],
    queryFn: () =>
      QRCode.toDataURL(bundleUrl!, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 480,
      }),
    enabled: !!bundleUrl,
    staleTime: Infinity,
  });

  const qrImageSource = useMemo(
    () => (qrQuery.data ? { uri: qrQuery.data } : null),
    [qrQuery.data],
  );

  const handleCopy = useCallback(async () => {
    if (!bundleUrl) return;
    await Clipboard.setStringAsync(bundleUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [bundleUrl]);

  const copyIcon = useMemo(
    () =>
      copied ? (
        <Check size={theme.iconSize.sm} color={theme.colors.accent} />
      ) : (
        <Copy size={theme.iconSize.sm} color={theme.colors.foreground} />
      ),
    [copied, theme.colors.accent, theme.colors.foreground, theme.iconSize.sm],
  );

  return (
    <AdaptiveModalSheet
      header={SHARE_HOSTS_HEADER}
      visible={visible}
      onClose={onClose}
      desktopMaxWidth={640}
      snapPoints={PAIRING_BUNDLE_SNAP_POINTS}
      testID="pairing-bundle-modal"
    >
      {bundleUrl ? (
        <View style={styles.content}>
          <Text style={styles.helper}>
            Scan this QR code or copy the link to add {shareableCount} host
            {shareableCount === 1 ? "" : "s"} on another device.
          </Text>
          <View style={styles.qrContainer}>
            <PairingBundleQrContent qrImageSource={qrImageSource} qrQuery={qrQuery} />
          </View>
          <View style={styles.linkRow}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.linkInput}
                value={bundleUrl}
                readOnly
                selectTextOnFocus
                selectionColor={theme.colors.accent}
              />
            </View>
            <Button variant="outline" size="sm" leftIcon={copyIcon} onPress={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <QrCode size={theme.iconSize.lg} color={theme.colors.foregroundMuted} />
          <Text style={styles.helper}>Only relay hosts can be shared with a pairing bundle.</Text>
        </View>
      )}
    </AdaptiveModalSheet>
  );
}

function PairingBundleQrContent(props: {
  qrImageSource: { uri: string } | null;
  qrQuery: { isError: boolean };
}) {
  if (props.qrImageSource) {
    return <Image source={props.qrImageSource} style={styles.qrImage} resizeMode="contain" />;
  }
  if (props.qrQuery.isError) {
    return <Text style={styles.helper}>QR code unavailable.</Text>;
  }
  return <ActivityIndicator size="small" />;
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  helper: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
  },
  qrContainer: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    width: 320,
    height: 320,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[2],
  },
  qrImage: {
    width: "100%",
    height: "100%",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  inputWrapper: {
    flex: 1,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
  },
  linkInput: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    outlineStyle: "none",
  } as object,
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[4],
  },
}));
