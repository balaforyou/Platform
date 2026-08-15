import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { MapPin, Clock, Shield, ArrowLeft, Activity, Image as ImageIcon, Navigation, Star } from 'lucide-react';

export default function BranchAbout() {
  const { branchId } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [aboutData, setAboutData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId) return;

    const fetchBranchAbout = async () => {
      try {
        setLoading(true);
        // GET /branches/:id/about
        const res = await apiRequest<any>(`/tenant/branches/${branchId}/about`, {
          token: accessToken,
        });
        setAboutData(res);
      } catch (err: any) {
        setError(err.message || 'Failed to load branch details.');
      } finally {
        setLoading(false);
      }
    };

    fetchBranchAbout();
  }, [branchId, accessToken]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white">
        <Activity className="h-10 w-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-gray-400 text-sm font-medium">Loading branch information...</p>
      </div>
    );
  }

  if (error || !aboutData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white p-4">
        <div className="h-12 w-12 text-red-500 mb-4 flex items-center justify-center rounded-full bg-red-950/20">
          <Shield className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold">Failed to load branch about information</h3>
        <p className="text-gray-400 text-sm mt-1 text-center max-w-md">{error || 'About data is missing.'}</p>
      </div>
    );
  }

  // WHY an explicit null/NaN check rather than a truthiness test: 0 is a valid coordinate
  // (lat 0, lng 0 is a real point in the Gulf of Guinea), so `aboutData.latitude && ...` would
  // silently hide the directions link for any branch sitting on the equator or prime meridian.
  const hasCoordinates =
    typeof aboutData.latitude === 'number' && Number.isFinite(aboutData.latitude) &&
    typeof aboutData.longitude === 'number' && Number.isFinite(aboutData.longitude);

  // Hotlinked photos list (fallbacks if empty)
  const photos = aboutData.photos && aboutData.photos.length > 0
    ? aboutData.photos
    : [
        'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=600&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1521537634199-673d5263a6da?q=80&w=600&auto=format&fit=crop'
      ];

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8 text-white">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center space-x-2 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Court Dashboard</span>
      </button>

      {/* Hero Title */}
      <div className="space-y-3">
        <h2 className="text-3xl font-extrabold tracking-tight font-outfit">
          About the <span className="text-[var(--brand-primary)]">Venue</span>
        </h2>
        {aboutData.address && (
          <div className="flex items-center space-x-2 text-xs text-gray-400 font-medium">
            <MapPin className="h-4 w-4 text-[var(--brand-primary)]" />
            <span>{aboutData.address}</span>
          </div>
        )}

        {/* Outbound location links. Each is gated on its own data rather than on `address`:
            a branch can have a postal address without coordinates, and the Place ID is
            independent of both. Rendering a button whose URL would carry `undefined` is worse
            than showing nothing, so absent data means an absent button. */}
        {(hasCoordinates || aboutData.googlePlaceId) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {hasCoordinates && (
              <a
                id="branch-directions-link"
                href={`https://www.google.com/maps/dir/?api=1&destination=${aboutData.latitude},${aboutData.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 py-2 px-4 rounded-xl bg-[var(--brand-primary)] hover:opacity-95 text-white text-xs font-semibold transition-all shadow-lg"
              >
                <Navigation className="h-3.5 w-3.5" />
                <span>Get Directions</span>
              </a>
            )}
            {aboutData.googlePlaceId && (
              <a
                id="branch-review-link"
                href={`https://search.google.com/local/writereview?placeid=${aboutData.googlePlaceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 py-2 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-all"
              >
                <Star className="h-3.5 w-3.5" />
                <span>Leave a Review</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Description Panel */}
      <div className="bg-white/5 border border-white/5 p-8 rounded-3xl space-y-6">
        {aboutData.description && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider font-outfit">
              Our Vision & Mission
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {aboutData.description}
            </p>
          </div>
        )}

        {/* Schedule */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider font-outfit flex items-center space-x-2">
              <Clock className="h-4 w-4 text-emerald-500" />
              <span>Working Schedule</span>
            </h3>
            <div className="text-xs text-gray-400 space-y-1 font-mono">
              <div>
                Days: <span className="text-gray-200">{aboutData.workingDays?.join(', ') || 'All Days'}</span>
              </div>
              {aboutData.workingHoursStart && aboutData.workingHoursEnd && (
                <div>
                  Hours: <span className="text-gray-200">{aboutData.workingHoursStart} - {aboutData.workingHoursEnd}</span>
                </div>
              )}
            </div>
          </div>

          {/* Facilities list */}
          {aboutData.facilities && aboutData.facilities.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider font-outfit flex items-center space-x-2">
                <Shield className="h-4 w-4 text-[var(--brand-primary)]" />
                <span>Facilities & Amenities</span>
              </h3>
              <div className="flex flex-wrap gap-2 pt-1">
                {aboutData.facilities.map((fac: string, idx: number) => (
                  <span
                    key={idx}
                    className="bg-white/5 text-gray-300 text-xs px-3 py-1 rounded-full border border-white/5 font-semibold"
                  >
                    {fac}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gallery Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider font-outfit flex items-center space-x-2">
          <ImageIcon className="h-4 w-4 text-[var(--brand-primary)]" />
          <span>Photo Gallery</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {photos.map((photoUrl: string, idx: number) => (
            <div
              key={idx}
              className="relative aspect-video overflow-hidden rounded-2xl border border-white/5 bg-gray-900 shadow-lg group"
            >
              <img
                src={photoUrl}
                alt={`Venue showcase ${idx + 1}`}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
