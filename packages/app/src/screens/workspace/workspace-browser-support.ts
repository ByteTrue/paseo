interface WorkspaceBrowserSupportInput {
  isElectron: boolean;
  isWeb: boolean;
}

export function shouldShowWorkspaceBrowserTabs(input: WorkspaceBrowserSupportInput): boolean {
  return input.isElectron || input.isWeb;
}
