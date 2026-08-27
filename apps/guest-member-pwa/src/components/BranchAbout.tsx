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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4" style={{ background: 'var(--color-bg)' }}>
        <Activity className="h-10 w-10 animate-spin" style={{ color: 'var(--color-accent-700)' }} />
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '14px', color: 'var(--color-neutral-700)' }}>
          Loading venue info&hellip;
        </p>
      </div>
    );
  }

  if (error || !aboutData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 gap-3 text-center" style={{ background: 'var(--color-bg)' }}>
        <span
          className="flex items-center justify-center"
          style={{ width: '48px', height: '48px', borderRadius: '999px', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)' }}
        >
          <Shield className="h-6 w-6" />
        </span>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '19px', color: 'var(--color-text)' }}>
          Couldn&rsquo;t load venue info
        </h3>
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--color-neutral-600)', maxWidth: '260px' }}>
          {error || 'About data is missing.'}
        </p>
      </div>
    );
  }

  // WHY an explicit null/NaN check rather than a truthiness test: 0 is a valid coordinate
  // (lat 0, lng 0 is a real point in the Gulf of Guinea), so `aboutData.latitude && ...` would
  // silently hide the directions link for any branch sitting on the equator or prime meridian.
  const hasCoordinates =
    typeof aboutData.latitude === 'number' && Number.isFinite(aboutData.latitude) &&
    typeof aboutData.longitude === 'number' && Number.isFinite(aboutData.longitude);

  // Real photos only -- no third-party hotlink fallback (per the JBC Migration wireframe).
  const photos: string[] = Array.isArray(aboutData.photos) ? aboutData.photos : [];

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8" style={{ background: 'var(--color-bg)' }}>
      {/* Back Button -- pill */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 transition-colors"
        style={{
          minHeight: '44px',
          padding: '0 16px 0 12px',
          background: 'var(--color-neutral-200)',
          border: '1px solid var(--color-neutral-300)',
          borderRadius: '999px',
          fontFamily: 'var(--font-body-organic)',
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--color-text)',
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to venue</span>
      </button>

      {/* Hero Title */}
      <div className="space-y-3">
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '30px', lineHeight: 1.15, color: 'var(--color-text)' }}>
          About the venue
        </h2>
        {aboutData.address && (
          <div className="flex items-start gap-2" style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
            <MapPin className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--color-accent-700)' }} />
            <span>{aboutData.address}</span>
          </div>
        )}

        {/* Outbound location links. Each is gated on its own data rather than on `address`:
            a branch can have a postal address without coordinates, and the Place ID is
            independent of both. Rendering a button whose URL would carry `undefined` is worse
            than showing nothing, so absent data means an absent button. */}
        {(hasCoordinates || aboutData.googlePlaceId) && (
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {hasCoordinates && (
              <a
                id="branch-directions-link"
                href={`https://www.google.com/maps/dir/?api=1&destination=${aboutData.latitude},${aboutData.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition-colors"
                style={{
                  minHeight: '48px',
                  padding: '0 18px',
                  background: 'var(--color-accent-700)',
                  border: 'none',
                  borderRadius: '14px',
                  fontFamily: 'var(--font-body-organic)',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  color: 'var(--color-accent-100)',
                }}
              >
                <Navigation className="h-4 w-4" />
                <span>Get directions</span>
              </a>
            )}
            {aboutData.googlePlaceId && (
              <a
                id="branch-review-link"
                href={`https://search.google.com/local/writereview?placeid=${aboutData.googlePlaceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition-colors"
                style={{
                  minHeight: '48px',
                  padding: '0 18px',
                  background: '#fff',
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: '14px',
                  fontFamily: 'var(--font-body-organic)',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                }}
              >
                <Star className="h-4 w-4" />
                <span>Leave a review</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Description / schedule / facilities panel */}
      <div
        className="space-y-5"
        style={{
          background: 'var(--color-neutral-100)',
          border: '1px solid var(--color-neutral-300)',
          borderRadius: 'var(--radius-lg)',
          padding: '22px',
        }}
      >
        {aboutData.description && (
          <div className="space-y-2">
            <div style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
              VISION AND MISSION
            </div>
            <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '13.5px', lineHeight: 1.6, color: 'var(--color-neutral-800)' }}>
              {aboutData.description}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5" style={{ paddingTop: '18px', borderTop: '1px solid var(--color-neutral-300)' }}>
          <div className="space-y-2">
            <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
              <Clock className="h-4 w-4" style={{ color: 'var(--color-accent-2-700)' }} />
              <span>WORKING SCHEDULE</span>
            </div>
            <div className="font-mono space-y-1" style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--color-neutral-700)' }}>
              <div>
                Days <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{aboutData.workingDays?.join(', ') || 'All days'}</span>
              </div>
              {aboutData.workingHoursStart && aboutData.workingHoursEnd && (
                <div>
                  Hours <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{aboutData.workingHoursStart} &ndash; {aboutData.workingHoursEnd}</span>
                </div>
              )}
            </div>
          </div>

          {aboutData.facilities && aboutData.facilities.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
                <Shield className="h-4 w-4" style={{ color: 'var(--color-accent-700)' }} />
                <span>FACILITIES</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {aboutData.facilities.map((fac: string, idx: number) => (
                  <span
                    key={idx}
                    style={{
                      fontFamily: 'var(--font-body-organic)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: 'var(--color-neutral-700)',
                      background: '#fff',
                      border: '1px solid var(--color-neutral-300)',
                      padding: '5px 12px',
                      borderRadius: '999px',
                    }}
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
      <div className="space-y-3">
        <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
          <ImageIcon className="h-4 w-4" style={{ color: 'var(--color-accent-700)' }} />
          <span>PHOTOS</span>
        </div>
        {photos.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 text-center"
            style={{
              background: 'var(--color-neutral-100)',
              border: '1px solid var(--color-neutral-300)',
              borderRadius: 'var(--radius-md)',
              padding: '32px 24px',
            }}
          >
            <ImageIcon className="h-7 w-7" style={{ color: 'var(--color-neutral-500)' }} />
            <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', color: 'var(--color-neutral-600)' }}>
              No photos yet for this venue.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {photos.map((photoUrl: string, idx: number) => (
              <div
                key={idx}
                className="relative aspect-video overflow-hidden"
                style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-300)' }}
              >
                <img
                  src={photoUrl}
                  alt={`Venue photo ${idx + 1}`}
                  className="h-full w-full object-cover"
                  style={{ filter: 'saturate(0.72) contrast(0.94)' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
