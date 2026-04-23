/**
 * A Peer address.
 *
 * Two shapes are supported:
 *   - `tenant/role`           — a singleton peer within a tenant (e.g. `safevoice/triage`)
 *   - `tenant/role/instance`  — an instance-specific peer (e.g. `safevoice/caseworker/alice`)
 *
 * Addresses are stable identifiers. Every Agent and every Human has one.
 */
export type Address = `${string}/${string}` | `${string}/${string}/${string}`;

/**
 * Parse an Address into its components.
 * Returns null if the string is not a valid address shape.
 */
export const parseAddress = (
  value: string,
): { tenant: string; role: string; instance?: string } | null => {
  const parts = value.split("/");
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((p) => p.length === 0)) return null;
  const [tenant, role, instance] = parts as [string, string, string?];
  return instance ? { tenant, role, instance } : { tenant, role };
};
