export function workspaceFileQueryKey(input: {
  serverId: string;
  cwd: string | null;
  path: string | null;
}) {
  return ["workspaceFile", input.serverId, input.cwd, input.path] as const;
}

export function workspaceFileQueryPrefix(input: { serverId: string }) {
  return ["workspaceFile", input.serverId] as const;
}
