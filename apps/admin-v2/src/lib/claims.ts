export interface AdminUser {
  userId: string;
  email: string | null;
  tenantId: string;
  userType: string;
  roles: string[];
}

/** Decode (not verify) a session JWT's payload into the admin identity the UI shows. */
export function parseAdminClaims(token: string): AdminUser | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const claims = JSON.parse(json);
    if (!claims?.userId || !claims?.tenantId) return null;
    return {
      userId: claims.userId,
      email: typeof claims.email === 'string' ? claims.email : null,
      tenantId: claims.tenantId,
      userType: typeof claims.userType === 'string' ? claims.userType : 'STAFF',
      roles: Array.isArray(claims.roles) ? claims.roles : [],
    };
  } catch {
    return null;
  }
}

const ROLE_LABELS: Record<string, string> = { owner: 'Owner' };

/** Human label for a role token from tenant-management (`owner`, `branch_manager:<id>`, …). */
export function roleLabel(token: string): string {
  if (ROLE_LABELS[token]) return ROLE_LABELS[token];
  if (token.startsWith('branch_manager:')) return 'Branch manager';
  if (token === 'front_desk' || token.startsWith('front_desk:')) return 'Front desk';
  return token;
}
