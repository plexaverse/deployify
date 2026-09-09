/**
 * Shared guard for storage-connector metadata.
 *
 * Lives in lib (not in a route module) because both POST /api/projects and the
 * /api/projects/[id]/storage routes accept connector metadata from a request body.
 */
/**
 * Metadata keys that belong to Deployify's control plane: they are written by
 * provisioning / sync / remediation and are READ by privileged code paths (IAM
 * remediation, GCP resource deletion, compliance reporting). They must never be
 * settable from a request body.
 *
 * Stripped by default. The dashboard never sends any of these (StorageSection.tsx
 * handleUpdate/handleScale build metadata by hand), and stripping only falls back to the
 * already-stored value, so it is a UI no-op. STORAGE_METADATA_STRICT=false restores the
 * previous warn-only behaviour.
 */
export const SERVER_OWNED_METADATA_KEYS = [
    'provisioned',
    'projectId',
    'resourceName',
    'excessiveRoles',
    'iamOverprivileged',
    'iamRoleVerified',
    'broadSecretAccess',
    'security',
    // Drives updateMaintenanceWindow() on a Cloud SQL instance resolved from
    // metadata.resourceName, so it must be server-written like the rest.
    'maintenanceRecommendation',
    'replicas'
] as const;

// `body` is untyped JSON here, and callers below read `metadata.tier`, `metadata.highAvailability`
// etc. Keep the loose shape so this helper is type-transparent and adds no tsc surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeClientMetadata(metadata: any, context: string): any {
    if (!metadata || typeof metadata !== 'object') return metadata;

    const present = SERVER_OWNED_METADATA_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(metadata, k));
    if (present.length === 0) return metadata;

    // Fail-safe by default: these keys gate GCP deletion, IAM remediation and Data Lab
    // database binding, so a request body must never set them. The dashboard never sends
    // them (StorageSection.tsx builds metadata by hand) and stripping falls back to the
    // already-stored value, so this is a UI no-op. STORAGE_METADATA_STRICT=false restores
    // the previous warn-only behaviour if an unexpected caller turns up.
    if (process.env.STORAGE_METADATA_STRICT === 'false') {
        console.warn(`[StorageMetadata] ${context}: request supplied server-owned metadata key(s) [${present.join(', ')}]; not stripped (STORAGE_METADATA_STRICT=false).`);
        return metadata;
    }

    console.warn(`[StorageMetadata] ${context}: stripped server-owned metadata key(s) [${present.join(', ')}] from request body.`);
    const sanitized = { ...metadata };
    for (const key of present) {
        delete sanitized[key];
    }
    return sanitized;
}
