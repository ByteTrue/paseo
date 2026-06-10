import {
  PASEO_SKILL_NAMES,
  getDefaultSkillTargets,
  getSkillsStatus as getSharedSkillsStatus,
  installSkills as installSharedSkills,
  uninstallSkills as uninstallSharedSkills,
  updateSkills as updateSharedSkills,
  autoUpdateInstalledSkills as autoUpdateSharedSkills,
  type SkillOp,
  type SkillsState,
  type SkillsStatus,
  type SkillTargets as SharedSkillTargets,
} from "@bytetrue/server";
import { getBundledSkillsDir } from "./paths.js";

export { PASEO_SKILL_NAMES };
export type { SkillOp, SkillsState, SkillsStatus };
export type SkillTargets = SharedSkillTargets;

function resolveSkillTargets(): SkillTargets {
  return getDefaultSkillTargets(getBundledSkillsDir());
}

export async function getSkillsStatus(targets?: SkillTargets): Promise<SkillsStatus> {
  return getSharedSkillsStatus(targets ?? resolveSkillTargets());
}

export async function installSkills(targets?: SkillTargets): Promise<SkillsStatus> {
  return installSharedSkills(targets ?? resolveSkillTargets());
}

export async function updateSkills(targets?: SkillTargets): Promise<SkillsStatus> {
  return updateSharedSkills(targets ?? resolveSkillTargets());
}

export async function autoUpdateInstalledSkills(targets?: SkillTargets): Promise<SkillsStatus> {
  return autoUpdateSharedSkills(targets ?? resolveSkillTargets());
}

export async function uninstallSkills(targets?: SkillTargets): Promise<SkillsStatus> {
  return uninstallSharedSkills(targets ?? resolveSkillTargets());
}
