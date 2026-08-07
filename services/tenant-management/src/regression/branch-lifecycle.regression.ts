import { Section } from '@badminton/test-harness';
import { tenantUrl, internalHeaders, TenantContext } from './_fixtures';

/**
 * Branch draft/active visibility gate and the dynamic-manifest error envelope.
 * Migrated verbatim from tenant.test.ts Tests 1 and 4.
 */
export const branchLifecycleSections: Section<TenantContext>[] = [
  {
    name: 'Draft-to-active branch gate (draft hidden from guests even with includeDraft=true)',
    async run(ctx) {
      const branchRes1 = await fetch(`${tenantUrl}/tenants/${ctx.tenant.id}/branches`, {
        method: 'POST',
        headers: internalHeaders,
        body: JSON.stringify({ name: 'Branch A', address: '123 Main St' }),
      });
      const branchA = ((await branchRes1.json()) as any).data;
      ctx.branchA = branchA;
      console.log(`Branch created (status defaults to DRAFT): ${branchA.name} (${branchA.id})`);

      const branchesGuest = await fetch(`${tenantUrl}/tenants/${ctx.tenant.id}/branches`);
      const branchesGuestList = ((await branchesGuest.json()) as any).data;
      if (branchesGuestList.length !== 0) {
        throw new Error(
          `Expected draft branch to be excluded from guest query, got count ${branchesGuestList.length}`,
        );
      }

      // The includeDraft flag must not be honoured without authorization.
      const branchesGuestDraft = await fetch(
        `${tenantUrl}/tenants/${ctx.tenant.id}/branches?includeDraft=true`,
      );
      const branchesGuestDraftList = ((await branchesGuestDraft.json()) as any).data;
      if (branchesGuestDraftList.length !== 0) {
        throw new Error('Guest query was able to view draft branches without authorization.');
      }
      console.log('Draft branch successfully hidden from guest picker.');

      const patchBranchRes = await fetch(`${tenantUrl}/branches/${branchA.id}`, {
        method: 'PATCH',
        headers: internalHeaders,
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
      if (patchBranchRes.status !== 200) {
        throw new Error(`Could not activate branch, got status ${patchBranchRes.status}`);
      }
      console.log('Branch status flipped to ACTIVE.');

      const branchesGuestActive = await fetch(`${tenantUrl}/tenants/${ctx.tenant.id}/branches`);
      const branchesGuestActiveList = ((await branchesGuestActive.json()) as any).data;
      if (branchesGuestActiveList.length !== 1 || branchesGuestActiveList[0].id !== branchA.id) {
        throw new Error('Active branch not returned in guest query.');
      }
      console.log('Active branch successfully visible to guest picker.');
    },
  },

  {
    name: 'Dynamic manifest error handling (unknown tenant → 404 TENANT_NOT_FOUND envelope)',
    async run() {
      const manifestErrorRes = await fetch(
        `${tenantUrl}/tenants/99999999-9999-9999-9999-999999999999/manifest.json`,
      );
      if (manifestErrorRes.status !== 404) {
        throw new Error(
          `Expected manifest.json of nonexistent tenant to return 404, got ${manifestErrorRes.status}`,
        );
      }
      const manifestError = (await manifestErrorRes.json()) as any;
      if (manifestError.error?.code !== 'TENANT_NOT_FOUND') {
        throw new Error(`Expected error code TENANT_NOT_FOUND, got ${manifestError.error?.code}`);
      }
      console.log('Dynamic manifest error path caught and returned standard envelope correctly.');
    },
  },
];
