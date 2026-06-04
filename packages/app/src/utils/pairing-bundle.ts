import {
  buildConnectionOfferBundleUrl,
  type ConnectionOffer,
  type ConnectionOfferBundle,
} from "@bytetrue/protocol/connection-offer";
import type { HostProfile, RelayHostConnection } from "@/types/host-connection";

export interface PairingBundleHostEntry {
  host: HostProfile;
  connection: RelayHostConnection;
  offer: ConnectionOffer;
}

function getShareableRelayConnection(host: HostProfile): RelayHostConnection | null {
  const preferred = host.preferredConnectionId
    ? host.connections.find(
        (connection): connection is RelayHostConnection =>
          connection.type === "relay" && connection.id === host.preferredConnectionId,
      )
    : null;
  if (preferred) return preferred;
  return (
    host.connections.find(
      (connection): connection is RelayHostConnection => connection.type === "relay",
    ) ?? null
  );
}

export function buildPairingBundleEntries(hosts: HostProfile[]): PairingBundleHostEntry[] {
  return hosts.flatMap((host) => {
    const connection = getShareableRelayConnection(host);
    if (!connection) return [];
    return [
      {
        host,
        connection,
        offer: {
          v: 2,
          serverId: host.serverId,
          daemonPublicKeyB64: connection.daemonPublicKeyB64,
          relay: {
            endpoint: connection.relayEndpoint,
            ...(connection.useTls !== undefined ? { useTls: connection.useTls } : {}),
          },
        },
      },
    ];
  });
}

export function buildPairingBundleFromHosts(hosts: HostProfile[]): ConnectionOfferBundle | null {
  const entries = buildPairingBundleEntries(hosts).map((entry) => ({
    label: entry.host.label,
    offer: entry.offer,
  }));
  if (entries.length === 0) return null;
  return { v: 1, entries };
}

export function buildPairingBundleUrlFromHosts(hosts: HostProfile[]): string | null {
  const bundle = buildPairingBundleFromHosts(hosts);
  return bundle ? buildConnectionOfferBundleUrl(bundle) : null;
}
