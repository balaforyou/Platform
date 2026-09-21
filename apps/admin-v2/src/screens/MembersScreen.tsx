import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { moduleVisible, useAdminTenant } from '../auth/AdminTenantContext';
import { EmptyState, LoadingState } from '../components';
import { CreateBatchForm } from './membersManagement/CreateBatchForm';

/**
 * F-133 Slice A — `/members`: batch (Group) creation. Replaces the plain `StubScreen` this route
 * held before. Gated MEMBER_MANAGEMENT, same F-206 posture as `GuestManagementScreen`'s own
 * GUEST_BOOKING gate -- refuses to render on an unentitled tenant even if reached directly.
 */
export function MembersScreen() {
  const navigate = useNavigate();
  const { entitlements } = useAdminTenant();

  if (entitlements === null) return <LoadingState label="Loading…" />;
  if (!moduleVisible(entitlements.MEMBER_MANAGEMENT)) {
    return (
      <EmptyState
        icon={<Users size={20} />}
        title="Member Management isn’t active for this account"
        description="Manage Members is part of the Member Management module. Contact the platform team to enable it."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--av2-space-6)', maxWidth: 640, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--av2-space-2)' }}>
        <button
          type="button"
          aria-label="Back to Apps"
          onClick={() => navigate('/apps')}
          style={{
            flex: 'none',
            marginTop: 2,
            display: 'inline-flex',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--av2-muted)',
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ margin: '0 0 var(--av2-space-1)', fontSize: 'var(--av2-text-lg)' }}>Manage Members</h2>
          <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
            Member records, plans, and status.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 'var(--av2-space-4)', minWidth: 0 }}>
        <CreateBatchForm />
      </div>
    </div>
  );
}
