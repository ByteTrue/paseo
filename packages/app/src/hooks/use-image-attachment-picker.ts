import { useCallback, useRef } from "react";
import { Alert } from "react-native";
import { getDesktopHost, isElectronRuntime } from "@/desktop/host";
import {
  openImagePathsWithDesktopDialog,
  type PickedImageAttachmentInput,
} from "@/hooks/image-attachment-picker";

interface UseImageAttachmentPickerResult {
  pickImages: () => Promise<PickedImageAttachmentInput[] | null>;
}

function pickImagesWithBrowserInput(): Promise<PickedImageAttachmentInput[] | null> {
  if (typeof document === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";

    let settled = false;
    let focusFallbackTimer: number | null = null;

    const cleanup = () => {
      if (focusFallbackTimer !== null) {
        window.clearTimeout(focusFallbackTimer);
      }
      window.removeEventListener("focus", handleWindowFocus);
      input.remove();
    };

    const settle = (value: PickedImageAttachmentInput[] | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const handleWindowFocus = () => {
      focusFallbackTimer = window.setTimeout(() => {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) {
          settle(null);
        }
      }, 250);
    };

    input.addEventListener(
      "change",
      () => {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) {
          settle(null);
          return;
        }
        settle(
          files.map((file) => ({
            source: { kind: "blob" as const, blob: file },
            mimeType: file.type || null,
            fileName: file.name || null,
          })),
        );
      },
      { once: true },
    );
    input.addEventListener("cancel", () => settle(null), { once: true });
    window.addEventListener("focus", handleWindowFocus);

    document.body.appendChild(input);
    input.click();
  });
}

export function useImageAttachmentPicker(): UseImageAttachmentPickerResult {
  const isPickingRef = useRef(false);

  const pickImages = useCallback(async () => {
    if (isPickingRef.current) {
      return null;
    }

    isPickingRef.current = true;

    try {
      if (isElectronRuntime()) {
        const selectedPaths = await openImagePathsWithDesktopDialog(getDesktopHost()?.dialog);
        if (selectedPaths.length === 0) {
          return null;
        }
        return selectedPaths.map((path) => ({
          source: { kind: "file_uri" as const, uri: path },
          mimeType: null,
          fileName: null,
        }));
      }

      return await pickImagesWithBrowserInput();
    } catch (error) {
      console.error("[ImageAttachmentPicker] Failed to pick image:", error);
      Alert.alert("Error", "Failed to select image");
      return null;
    } finally {
      isPickingRef.current = false;
    }
  }, []);

  return { pickImages };
}
