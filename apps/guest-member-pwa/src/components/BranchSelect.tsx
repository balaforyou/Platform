import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { MapPin, Clock, ChevronRight, Activity } from 'lucide-react';

export default function BranchSelect() {
  const { tenant } = useTenant();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;

    const fetchBranches = async () => {
      try {
        setLoading(true);
        // GET /tenants/:id/branches
        const res = await apiRequest<any[]>(`/tenant/tenants/${tenant.id}/branches`, {
          token: accessToken,
        });
        setBranches(res || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load branches.');
      } finally {
        setLoading(false);
      }
    };

    fetchBranches();
  }, [tenant, accessToken]);

  const handleSelectBranch = (branchId: string) => {
    localStorage.setItem('selected_branch_id', branchId);
    navigate(`/branches/${branchId}`);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4" style={{ background: 'var(--color-bg)' }}>
        <Activity className="h-10 w-10 animate-spin" style={{ color: 'var(--color-accent-700)' }} />
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '14px', color: 'var(--color-neutral-700)' }}>
          Loading venues&hellip;
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 gap-3 text-center" style={{ background: 'var(--color-bg)' }}>
        <span
          className="flex items-center justify-center"
          style={{ width: '48px', height: '48px', borderRadius: '999px', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)' }}
        >
          <MapPin className="h-6 w-6" />
        </span>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '19px', color: 'var(--color-text)' }}>
          Couldn&rsquo;t load venues
        </h3>
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--color-neutral-600)', maxWidth: '260px' }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8" style={{ background: 'var(--color-bg)' }}>
      <div className="space-y-2">
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '30px', lineHeight: 1.15, color: 'var(--color-text)' }}>
          Pick a venue
        </h2>
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '13.5px', lineHeight: 1.55, color: 'var(--color-neutral-800)', maxWidth: '28rem' }}>
          Choose a badminton venue to browse courts and book your slot.
        </p>
      </div>

      {branches.length === 0 ? (
        <div
          className="p-9 text-center flex flex-col items-center gap-2.5 mx-auto"
          style={{
            background: 'var(--color-neutral-100)',
            border: '1px solid var(--color-neutral-300)',
            borderRadius: 'var(--radius-lg)',
            maxWidth: '24rem',
          }}
        >
          <span
            className="flex items-center justify-center"
            style={{ width: '48px', height: '48px', borderRadius: '999px', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)' }}
          >
            <MapPin className="h-6 w-6" />
          </span>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '19px', color: 'var(--color-text)' }}>
            No venues open
          </div>
          <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--color-neutral-600)', maxWidth: '14rem' }}>
            No branches are active right now. Try again shortly.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((branch) => (
            <div
              key={branch.id}
              onClick={() => handleSelectBranch(branch.id)}
              className="cursor-pointer flex flex-col gap-3 p-[18px] transition-colors"
              style={{
                background: '#fff',
                border: '1px solid var(--color-neutral-300)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-neutral-400)';
                e.currentTarget.style.background = 'var(--color-neutral-100)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-neutral-300)';
                e.currentTarget.style.background = '#fff';
              }}
              id={`branch-card-${branch.id}`}
            >
              <div className="flex items-center justify-between gap-2.5">
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '19px', color: 'var(--color-text)', flex: 1 }}>
                  {branch.name}
                </h3>
                <ChevronRight className="h-[18px] w-[18px] shrink-0" style={{ color: 'var(--color-accent-700)' }} />
              </div>

              {branch.address && (
                <div className="flex items-start gap-2" style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
                  <MapPin className="h-[15px] w-[15px] shrink-0 mt-0.5" style={{ color: 'var(--color-accent-700)' }} />
                  <span>{branch.address}</span>
                </div>
              )}

              {branch.workingHoursStart && branch.workingHoursEnd && (
                <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', color: 'var(--color-neutral-700)' }}>
                  <Clock className="h-[15px] w-[15px] shrink-0" style={{ color: 'var(--color-accent-2-700)' }} />
                  <span>
                    Open {branch.workingHoursStart} &ndash; {branch.workingHoursEnd}
                  </span>
                </div>
              )}

              {branch.aboutDescription && (
                <p
                  className="line-clamp-2"
                  style={{
                    fontFamily: 'var(--font-body-organic)',
                    fontSize: '12.5px',
                    lineHeight: 1.5,
                    color: 'var(--color-neutral-600)',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--color-neutral-200)',
                  }}
                >
                  {branch.aboutDescription}
                </p>
              )}

              {branch.facilities && branch.facilities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {branch.facilities.slice(0, 3).map((facility: string, idx: number) => (
                    <span
                      key={idx}
                      style={{
                        fontFamily: 'var(--font-body-organic)',
                        fontSize: '10.5px',
                        fontWeight: 600,
                        color: 'var(--color-neutral-700)',
                        background: 'var(--color-neutral-100)',
                        border: '1px solid var(--color-neutral-300)',
                        padding: '4px 10px',
                        borderRadius: '999px',
                      }}
                    >
                      {facility}
                    </span>
                  ))}
                  {branch.facilities.length > 3 && (
                    <span className="self-center" style={{ fontSize: '10.5px', color: 'var(--color-neutral-500)' }}>
                      +{branch.facilities.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
