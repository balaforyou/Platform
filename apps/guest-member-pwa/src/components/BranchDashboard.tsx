import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { Calendar, Info, MapPin, Activity, HelpCircle, ChevronRight } from 'lucide-react';

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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white">
        <Activity className="h-10 w-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-gray-400 text-sm font-medium">Loading branch dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white p-4">
        <HelpCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-bold">Failed to load branch</h3>
        <p className="text-gray-400 text-sm mt-1 text-center max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Branch Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-8 rounded-3xl bg-gradient-to-tr from-gray-900 to-gray-950 border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="space-y-3 relative z-10">
          <div className="inline-flex items-center space-x-1.5 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 text-[var(--brand-primary)] px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider font-outfit">
            <MapPin className="h-3.5 w-3.5" />
            <span>Coimbatore</span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight font-outfit text-white">
            Welcome to the <span className="text-[var(--brand-primary)]">Branch Dashboard</span>
          </h2>
          {branchAbout?.description && (
            <p className="text-gray-400 text-sm max-w-xl leading-relaxed">
              {branchAbout.description}
            </p>
          )}
        </div>
        <div className="shrink-0 relative z-10 flex space-x-3">
          <Link
            to={`/branches/${branchId}/about`}
            className="py-3 px-6 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 font-semibold flex items-center space-x-2 transition-all"
            id="view-about-branch-btn"
          >
            <Info className="h-4 w-4 text-[var(--brand-primary)]" />
            <span>Branch Info</span>
          </Link>
          <button
            onClick={() => navigate('/branches')}
            className="py-3 px-6 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 font-semibold transition-all text-xs"
          >
            Switch Branch
          </button>
        </div>
      </div>

      {/* Resource Pools / Courts Listing */}
      <div className="space-y-6">
        <div className="space-y-1">
          <h3 className="text-xl font-bold font-outfit text-white">Available Court Categories</h3>
          <p className="text-gray-400 text-xs">
            Browse our list of court pools and select one to see availability or book slots.
          </p>
        </div>

        {pools.length === 0 ? (
          <div className="bg-white/5 border border-white/5 p-12 rounded-2xl text-center text-gray-400 font-medium">
            No active court pools found at this branch.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pools.map((pool) => {
              const pricingText = pool.pricingMode === 'PER_PERSON' 
                ? `₹${pool.defaultRate}/player` 
                : `₹${pool.defaultRate} Flat`;

              return (
                <div
                  key={pool.id}
                  onClick={() => navigate(`/branches/${branchId}/book/${pool.id}`)}
                  className="group cursor-pointer bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-2xl p-6 transition-all duration-300 shadow-lg flex flex-col justify-between space-y-4 hover:-translate-y-0.5"
                  id={`court-pool-card-${pool.id}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-bold font-outfit text-white group-hover:text-[var(--brand-primary)] transition-colors">
                        {pool.name}
                      </h4>
                      <div className="text-xs bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] px-2.5 py-1 rounded-full font-bold font-mono">
                        {pricingText}
                      </div>
                    </div>

                    {pool.aboutDescription && (
                      <p className="text-xs text-gray-400 leading-relaxed">
                        {pool.aboutDescription}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-400 pt-2 font-mono">
                      <div>
                        Capacity: <span className="text-gray-200">{pool.capacity} seats</span>
                      </div>
                      {pool.minOccupancy > 1 && (
                        <div>
                          Min Players: <span className="text-gray-200">{pool.minOccupancy}</span>
                        </div>
                      )}
                      <div>
                        Duration: <span className="text-gray-200">{pool.minBookingDurationMinutes}m</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-gray-400 group-hover:text-white transition-colors">
                    <span className="flex items-center space-x-1.5 font-semibold">
                      <Calendar className="h-4 w-4 text-[var(--brand-primary)]" />
                      <span>Check Slots & Book</span>
                    </span>
                    <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
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
