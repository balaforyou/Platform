import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { Calendar, Info, MapPin, Activity, ChevronRight } from 'lucide-react';

export default function BranchDashboard() {
  const { branchId } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [pools, setPools] = useState<any[]>([]);
  const [branchAbout, setBranchAbout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId) return;

    const fetchBranchData = async () => {
      try {
        setLoading(true);
        // 1. Fetch resource pools (includes bookingRules)
        const poolsRes = await apiRequest<any[]>(`/slot-engine/branches/${branchId}/resource-pools`, {
          token: accessToken,
        });
        setPools(poolsRes || []);

        // 2. Fetch branch about details (public fallback endpoint)
        const aboutRes = await apiRequest<any>(`/tenant/branches/${branchId}/about`, {
          token: accessToken,
        });
        setBranchAbout(aboutRes);
      } catch (err: any) {
        setError(err.message || 'Failed to load branch details.');
      } finally {
        setLoading(false);
      }
    };

    fetchBranchData();
  }, [branchId, accessToken]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4" style={{ background: 'var(--color-bg)' }}>
        <Activity className="h-10 w-10 animate-spin" style={{ color: 'var(--color-accent-700)' }} />
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '14px', color: 'var(--color-neutral-700)' }}>
          Loading venue&hellip;
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
          Couldn&rsquo;t load this venue
        </h3>
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--color-neutral-600)', maxWidth: '260px' }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8" style={{ background: 'var(--color-bg)' }}>
      {/* Branch header -- no gradient hero, plain column on the Layout cream ground */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-3">
          {branchAbout?.address && (
            <div className="flex items-start gap-2" style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
              <MapPin className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--color-accent-700)' }} />
              <span>{branchAbout.address}</span>
            </div>
          )}
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '30px', lineHeight: 1.15, color: 'var(--color-text)' }}>
            {branchAbout?.name || 'Venue'}
          </h2>
          {branchAbout?.description && (
            <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '13.5px', lineHeight: 1.55, color: 'var(--color-neutral-800)', maxWidth: '36rem' }}>
              {branchAbout.description}
            </p>
          )}
        </div>
        <div className="shrink-0 flex gap-2.5">
          <Link
            to={`/branches/${branchId}/about`}
            id="view-about-branch-btn"
            className="inline-flex items-center gap-2 transition-colors"
            style={{
              minHeight: '48px',
              padding: '0 20px',
              background: '#fff',
              border: '1px solid var(--color-neutral-300)',
              borderRadius: '14px',
              fontFamily: 'var(--font-body-organic)',
              fontSize: '13.5px',
              fontWeight: 700,
              color: 'var(--color-text)',
            }}
          >
            <Info className="h-4 w-4" style={{ color: 'var(--color-accent-700)' }} />
            <span>Venue info</span>
          </Link>
          <button
            onClick={() => navigate('/branches')}
            className="inline-flex items-center transition-colors"
            style={{
              minHeight: '48px',
              padding: '0 20px',
              background: 'transparent',
              border: '1px solid var(--color-neutral-300)',
              borderRadius: '14px',
              fontFamily: 'var(--font-body-organic)',
              fontSize: '13.5px',
              fontWeight: 700,
              color: 'var(--color-neutral-700)',
            }}
          >
            Switch venue
          </button>
        </div>
      </div>

      {/* Resource Pools / Courts Listing */}
      <div className="space-y-4">
        <div className="space-y-1">
          <div style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
            COURT CATEGORIES
          </div>
          <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', color: 'var(--color-neutral-700)' }}>
            Browse the court pools at this venue and pick one to see availability.
          </p>
        </div>

        {pools.length === 0 ? (
          <div
            className="p-12 text-center"
            style={{
              background: 'var(--color-neutral-100)',
              border: '1px solid var(--color-neutral-300)',
              borderRadius: 'var(--radius-lg)',
              fontFamily: 'var(--font-body-organic)',
              color: 'var(--color-neutral-600)',
            }}
          >
            No active court pools found at this venue.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pools.map((pool) => {
              const pricingText = pool.pricingMode === 'PER_PERSON'
                ? `₹${pool.defaultRate}/player`
                : `₹${pool.defaultRate} flat`;

              return (
                <div
                  key={pool.id}
                  onClick={() => navigate(`/branches/${branchId}/book/${pool.id}`)}
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
                  id={`court-pool-card-${pool.id}`}
                >
                  <div className="flex items-start gap-2.5">
                    <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '18px', color: 'var(--color-text)', flex: 1 }}>
                      {pool.name}
                    </h4>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: 'var(--color-accent-800)',
                        background: 'var(--color-accent-200)',
                        padding: '5px 10px',
                        borderRadius: '999px',
                      }}
                    >
                      {pricingText}
                    </span>
                  </div>

                  {pool.aboutDescription && (
                    <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--color-neutral-600)' }}>
                      {pool.aboutDescription}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono" style={{ fontSize: '11.5px', color: 'var(--color-neutral-700)' }}>
                    <span>
                      Capacity <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{pool.capacity}</span>
                    </span>
                    {pool.minOccupancy > 1 && (
                      <span>
                        Min <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{pool.minOccupancy}</span>
                      </span>
                    )}
                    <span>
                      Slot <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{pool.minBookingDurationMinutes}m</span>
                    </span>
                  </div>

                  <div
                    className="flex items-center justify-between"
                    style={{
                      paddingTop: '12px',
                      borderTop: '1px solid var(--color-neutral-200)',
                      fontFamily: 'var(--font-body-organic)',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: 'var(--color-accent-700)',
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      <span>Check slots and book</span>
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
