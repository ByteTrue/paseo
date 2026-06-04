import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { Link } from "lucide-react-native";
import type { HostProfile } from "@/types/host-connection";
import { useHosts, useHostMutations } from "@/runtime/host-runtime";
import { normalizeHostPort } from "@/utils/daemon-endpoints";
import { connectToDaemon } from "@/utils/test-daemon-connection";
import {
  parseConnectionOfferBundleFromUrl,
  parseConnectionOfferFromUrl,
} from "@bytetrue/protocol/connection-offer";
import { AdaptiveModalSheet, AdaptiveTextInput, type SheetHeader } from "./adaptive-modal-sheet";
import { Button } from "@/components/ui/button";

const FLEX_ONE_STYLE = { flex: 1 } as const;
const PAIR_LINK_HEADER: SheetHeader = { title: "Paste pairing link" };

const styles = StyleSheet.create((theme) => ({
  helper: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  field: {
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  input: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
}));

export interface PairLinkModalProps {
  visible: boolean;
  onClose: () => void;
  onCancel?: () => void;
  onSaved?: (result: {
    profile: HostProfile;
    serverId: string;
    hostname: string | null;
    isNewHost: boolean;
  }) => void;
}

export function PairLinkModal({ visible, onClose, onCancel, onSaved }: PairLinkModalProps) {
  const { theme } = useUnistyles();
  const daemons = useHosts();
  const {
    upsertConnectionFromOfferUrl: upsertDaemonFromOfferUrl,
    upsertConnectionsFromOfferBundleUrl: upsertDaemonsFromOfferBundleUrl,
  } = useHostMutations();
  const isMobile = useIsCompactFormFactor();

  const offerUrlRef = useRef("");
  const inputRef = useRef<TextInput>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const clearInput = useCallback(() => {
    offerUrlRef.current = "";
    inputRef.current?.clear();
  }, []);

  const pairIcon = useMemo(
    () => <Link size={16} color={theme.colors.palette.white} />,
    [theme.colors.palette.white],
  );

  const handleClose = useCallback(() => {
    if (isSaving) return;
    clearInput();
    setErrorMessage("");
    onClose();
  }, [isSaving, clearInput, onClose]);

  const handleCancel = useCallback(() => {
    if (isSaving) return;
    clearInput();
    setErrorMessage("");
    (onCancel ?? onClose)();
  }, [isSaving, clearInput, onCancel, onClose]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    const raw = offerUrlRef.current.trim();
    if (!raw) {
      setErrorMessage("Paste a pairing link (…/#offer=... or …/#offers=...)");
      return;
    }
    if (!raw.includes("#offer=") && !raw.includes("#offers=")) {
      setErrorMessage("Link must include #offer= or #offers=...");
      return;
    }

    const parsedLink = (() => {
      try {
        const bundle = parseConnectionOfferBundleFromUrl(raw);
        if (bundle) return { kind: "bundle" as const, bundle };
        const offer = parseConnectionOfferFromUrl(raw);
        if (offer) return { kind: "offer" as const, offer };
        throw new Error("Link must include #offer= or #offers=...");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid pairing link";
        setErrorMessage(message);
        if (!isMobile) {
          Alert.alert("Pairing failed", message);
        }
        return null;
      }
    })();

    if (!parsedLink) {
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");

      if (parsedLink.kind === "bundle") {
        const existingServerIds = new Set(daemons.map((daemon) => daemon.serverId));
        const profiles = await upsertDaemonsFromOfferBundleUrl(raw);
        const firstProfile = profiles[0];
        if (firstProfile) {
          onSaved?.({
            profile: firstProfile,
            serverId: firstProfile.serverId,
            hostname: null,
            isNewHost: !existingServerIds.has(firstProfile.serverId),
          });
        }
        handleClose();
        return;
      }

      const { client, hostname } = await connectToDaemon(
        {
          id: "probe",
          type: "relay",
          relayEndpoint: normalizeHostPort(parsedLink.offer.relay.endpoint),
          useTls: parsedLink.offer.relay.useTls,
          daemonPublicKeyB64: parsedLink.offer.daemonPublicKeyB64,
        },
        { serverId: parsedLink.offer.serverId },
      );
      await client.close().catch(() => undefined);

      const isNewHost = !daemons.some((daemon) => daemon.serverId === parsedLink.offer.serverId);
      const profile = await upsertDaemonFromOfferUrl(raw, hostname ?? undefined);
      onSaved?.({ profile, serverId: parsedLink.offer.serverId, hostname, isNewHost });
      handleClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to pair host";
      setErrorMessage(message);
      if (!isMobile) {
        Alert.alert("Pairing failed", message);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    daemons,
    handleClose,
    isMobile,
    isSaving,
    onSaved,
    upsertDaemonFromOfferUrl,
    upsertDaemonsFromOfferBundleUrl,
  ]);

  const handleChangeOfferUrl = useCallback((next: string) => {
    offerUrlRef.current = next;
  }, []);

  const handleSavePress = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  return (
    <AdaptiveModalSheet
      header={PAIR_LINK_HEADER}
      visible={visible}
      onClose={handleClose}
      testID="pair-link-modal"
    >
      <Text style={styles.helper}>Paste a pairing link or pairing bundle.</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Pairing link</Text>
        <AdaptiveTextInput
          ref={inputRef}
          testID="pair-link-input"
          nativeID="pair-link-input"
          accessibilityLabel="pair-link-input"
          onChangeText={handleChangeOfferUrl}
          placeholder="https://paseo.zijieapi.de5.net/#offer=..."
          placeholderTextColor={theme.colors.foregroundMuted}
          style={styles.input}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button
          style={FLEX_ONE_STYLE}
          variant="secondary"
          onPress={handleCancel}
          disabled={isSaving}
          testID="pair-link-cancel"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          Cancel
        </Button>
        <Button
          style={FLEX_ONE_STYLE}
          variant="default"
          onPress={handleSavePress}
          disabled={isSaving}
          testID="pair-link-submit"
          accessibilityRole="button"
          accessibilityLabel="Pair"
          leftIcon={pairIcon}
        >
          {isSaving ? "Pairing..." : "Pair"}
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}
