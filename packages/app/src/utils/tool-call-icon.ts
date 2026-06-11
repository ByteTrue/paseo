import { createElement, type ComponentType } from "react";
import {
  Bot,
  Brain,
  Eye,
  MicVocal,
  Pencil,
  Search,
  Sparkles,
  SquareTerminal,
  Wrench,
} from "lucide-react-native";
import type { ToolCallDetail } from "@bytetrue/protocol/agent-types";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { resolveToolCallIconName, type ToolCallIcon } from "./tool-call-icon-name";

export interface ToolCallIconProps {
  size?: number;
  color?: string;
}

export type ToolCallIconComponent = ComponentType<ToolCallIconProps>;

function PaseoToolCallIcon({ size }: ToolCallIconProps) {
  return createElement(PaseoLogo, { size });
}

const ICON_COMPONENTS: Record<ToolCallIcon, ToolCallIconComponent> = {
  wrench: Wrench,
  square_terminal: SquareTerminal,
  eye: Eye,
  pencil: Pencil,
  search: Search,
  bot: Bot,
  sparkles: Sparkles,
  brain: Brain,
  mic_vocal: MicVocal,
  paseo: PaseoToolCallIcon,
};

export function componentForToolCallIcon(name: ToolCallIcon): ToolCallIconComponent {
  return ICON_COMPONENTS[name];
}

export function resolveToolCallIcon(
  toolName: string,
  detail?: ToolCallDetail,
): ToolCallIconComponent {
  return componentForToolCallIcon(resolveToolCallIconName(toolName, detail));
}
