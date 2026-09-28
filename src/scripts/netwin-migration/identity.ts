import { createHash } from 'node:crypto';

// Fixed root namespace UUID for V.tal Nexus Netwin Migration (RFC 4122 UUID v5)
export const NEXUS_NETWIN_NAMESPACE = '7b4e9f30-1428-4e89-9a2c-f67b5e19a421';

/**
 * Generates an RFC 4122 UUID v5 deterministically from a namespace UUID and a name string.
 * Completely stateless, $O(1)$ memory usage.
 */
export function deterministicUuid(namespaceUuid: string, name: string): string {
  const nsHex = namespaceUuid.replace(/-/g, '');
  const nsBytes = Buffer.from(nsHex, 'hex');
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = createHash('sha1')
    .update(Buffer.concat([nsBytes, nameBytes]))
    .digest();

  // Set version to 5 (0101)
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  // Set variant to RFC 4122 (10xx)
  hash[8] = (hash[8]! & 0x3f) | 0x80;

  const hex = hash.toString('hex', 0, 16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function netwinLocationId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:LOCATION:${sourceId}`);
}

export function netwinEquipmentId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:OSP_EQUIPMENT:${sourceId}`);
}

export function netwinCableId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:OSP_CABLE:${sourceId}`);
}

export function netwinInternalRackId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:ISP_INS_BASTIDOR:${sourceId}`);
}

export function netwinInternalSubrackId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:ISP_INS_SUBBASTIDOR:${sourceId}`);
}

export function netwinInternalEquipmentId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:ISP_INS_EQUIPAMENTO:${sourceId}`);
}

export function netwinInternalCardId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:ISP_INS_CARTA:${sourceId}`);
}

export function netwinInternalSlotId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:ISP_INS_SLOT:${sourceId}`);
}

export function netwinInternalPhysicalPortId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:ISP_INS_PORTO_FISICO:${sourceId}`);
}

export function netwinRouteId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:OSP_ROUTE:${sourceId}`);
}

export function netwinPartyId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:PARTY:${sourceId}`);
}

export function netwinPartyRoleId(partyId: string, roleName: string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:PARTY_ROLE:${partyId}:${roleName}`);
}

export function netwinAddressId(sourceId: number | string): string {
  return deterministicUuid(NEXUS_NETWIN_NAMESPACE, `NETWIN:ADDRESS:${sourceId}`);
}

export function sha256Hex(payload: unknown): string {
  return createHash('sha256')
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
}
