import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminApi } from '../../lib/useAdminApi';
import { useAdminAuth } from '../../auth/AdminAuthContext';
import { useAdminTenant } from '../../auth/AdminTenantContext';
import type { BranchSettingsInput } from './schema';

export interface Branch {
  id: string;
  name: string;
  status: string;
  address?: string | null;
  photos?: string[];
  workingDays?: string[];
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
}

/** owner sees every branch; branch_manager:<id> sees only the branches its roles scope it to. */
const branchScopes = (roles: string[] = []) =>
  roles
    .filter((r) => r.startsWith('branch_manager:'))
    .map((r) => r.split(':')[1])
    .filter(Boolean);

const branchesKey = (tenantId?: string) => ['branch-settings', 'branches', tenantId] as const;

export function useBranchList() {
  const api = useAdminApi();
  const { tenant } = useAdminTenant();
  const { user } = useAdminAuth();
  const scopes = branchScopes(user?.roles || []);
  return useQuery({
    queryKey: branchesKey(tenant?.id),
    enabled: !!tenant?.id,
    queryFn: async () => {
      const branches = await api.get<Branch[]>(`/tenant/tenants/${tenant?.id}/branches?includeDraft=true`);
      const scoped = user?.roles?.includes('owner') ? branches : branches.filter((b) => scopes.includes(b.id));
      // Stable order — the endpoint has no orderBy, so data[0] (the default selection) would
      // otherwise wobble between loads.
      return [...scoped].sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/** PATCH /tenant/branches/:id — the same mutation the discarded ConfigurationPanel used. */
export function useSaveBranchSettings(branchId: string) {
  const api = useAdminApi();
  const qc = useQueryClient();
  const { tenant } = useAdminTenant();
  return useMutation({
    mutationFn: (input: BranchSettingsInput) => api.patch<Branch>(`/tenant/branches/${branchId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: branchesKey(tenant?.id) }),
  });
}
