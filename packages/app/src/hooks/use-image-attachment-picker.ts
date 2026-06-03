import { useCallback, useRef } from "react";
import { Alert } from "react-native";
import { getDesktopHost, isElectronRuntime } from "@/desktop/host";
import {
  openImagePathsWithDesktopDialog,
  type PickedImageAttachmentInput,
} from "@/hooks/image-attachment-picker";
import { isWeb } from "@/constants/platform";

interface UseImageAttachmentPickerResult {
  pickImages: () => Promise<PickedImageAttachmentInput[] | null>;
}

function openBrowserImagePicker(): Promise<PickedImageAttachmentInput[] | null> {
  if (!isWeb || typeof document === "undefined") {
    throw new Error("Browser image picker is not available in this environment.");
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";

    let settled = false;

    const cleanup = () => {
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);
      window.removeEventListener("focus", handleWindowFocus);
      input.remove();
    };

    const settle = (value: PickedImageAttachmentInput[] | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const handleChange = () => {
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
    };

    const handleCancel = () => {
      settle(null);
    };

    const handleWindowFocus = () => {
      window.setTimeout(() => {
        if (!settled && (input.files?.length ?? 0) === 0) {
          settle(null);
        }
      }, 0);
    };

    input.addEventListener("change", handleChange);
    input.addEventListener("cancel", handleCancel);
    window.addEventListener("focus", handleWindowFocus, { once: true });
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

      return await openBrowserImagePicker();
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
