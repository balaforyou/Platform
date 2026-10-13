export interface AdminUser {
  userId: string;
  email: string | null;
  /** Signed into the JWT by identity-auth; nullable in the schema and unset for a
   *  Google-signup admin, so treat as usually absent. */
  phone: string | null;
  tenantId: string;
  userType: string;
  roles: string[];
  /** F-219: real name from Google, persisted on a real Google login; null for dev-login
   *  or an admin who has never signed in with Google. */
  displayName: string | null;
  /** F-219: Google profile photo URL, same persistence caveat as displayName. */
  photoUrl: string | null;
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
      phone: typeof claims.phone === 'string' ? claims.phone : null,
      tenantId: claims.tenantId,
      userType: typeof claims.userType === 'string' ? claims.userType : 'STAFF',
      roles: Array.isArray(claims.roles) ? claims.roles : [],
      displayName: typeof claims.displayName === 'string' ? claims.displayName : null,
      photoUrl: typeof claims.photoUrl === 'string' ? claims.photoUrl : null,
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

/**
 * S1: the role kinds the shell distinguishes. `owner` sees every branch; `manager` is scoped
 * to the branches in its `branch_manager:<id>` tokens (one or several); `none` is any other
 * signed-in admin (kept as today: no role-based hiding is applied).
 *
 * UI-ONLY. These drive navigation and the branch switcher; they are NOT a security boundary.
 * The services decide what a token may do (see F-341 for how little they restrict a manager
 * today; slice S0 is the server-side enforcement).
 */
export type RoleKind = 'owner' | 'manager' | 'none';

/** Branch ids a manager is scoped to, from `branch_manager:<id>` role tokens. */
export function branchScopes(roles: string[] = []): string[] {
  return roles
    .filter((role) => role.startsWith('branch_manager:'))
    .map((role) => role.split(':')[1])
    .filter(Boolean);
}

/** Owner wins over manager if a token somehow carries both. */
export function roleKind(roles: string[] = []): RoleKind {
  if (roles.includes('owner')) return 'owner';
  if (branchScopes(roles).length > 0) return 'manager';
  return 'none';
}
