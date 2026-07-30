import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { MapPin, Clock, ChevronRight, HelpCircle, Activity } from 'lucide-react';

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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white">
        <Activity className="h-10 w-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-gray-400 text-sm font-medium">Loading branches...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white p-4">
        <HelpCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-bold">Failed to load branches</h3>
        <p className="text-gray-400 text-sm mt-1 text-center max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight font-outfit text-white">
          Select a <span className="text-[var(--brand-primary)]">Branch</span>
        </h2>
        <p className="text-gray-400 text-sm max-w-md">
          Choose a badminton venue from our locations to browse courts and book your game slot.
        </p>
      </div>

      {branches.length === 0 ? (
        <div className="bg-white/5 border border-white/5 p-8 rounded-2xl text-center text-gray-400">
          No branches are active at this time.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((branch) => (
            <div
              key={branch.id}
              onClick={() => handleSelectBranch(branch.id)}
              className="group cursor-pointer bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-2xl p-6 transition-all duration-300 shadow-lg flex flex-col justify-between space-y-4 hover:-translate-y-1"
              id={`branch-card-${branch.id}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold font-outfit text-white group-hover:text-[var(--brand-primary)] transition-colors">
                    {branch.name}
                  </h3>
                  <ChevronRight className="h-5 w-5 text-gray-500 group-hover:text-[var(--brand-primary)] transition-all group-hover:translate-x-1" />
                </div>
                
                {branch.address && (
                  <div className="flex items-start space-x-2 text-xs text-gray-400">
                    <MapPin className="h-4 w-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{branch.address}</span>
                  </div>
                )}

                {branch.workingHoursStart && branch.workingHoursEnd && (
                  <div className="flex items-center space-x-2 text-xs text-gray-400">
                    <Clock className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>
                      Open: {branch.workingHoursStart} - {branch.workingHoursEnd}
                    </span>
                  </div>
                )}

                {branch.aboutDescription && (
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 pt-2 border-t border-white/5">
                    {branch.aboutDescription}
                  </p>
                )}
              </div>

              {branch.facilities && branch.facilities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {branch.facilities.slice(0, 3).map((facility: string, idx: number) => (
                    <span
                      key={idx}
                      className="bg-white/5 text-gray-300 text-[10px] px-2 py-0.5 rounded-full border border-white/5 font-medium"
                    >
                      {facility}
                    </span>
                  ))}
                  {branch.facilities.length > 3 && (
                    <span className="text-[10px] text-gray-500 self-center">
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
