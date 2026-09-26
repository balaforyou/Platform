import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, MapPin, Clock, Shield, Image as ImageIcon, Navigation, Star } from 'lucide-react';
import { apiRequest, useAuth } from '@badminton/ui-shared';
import LoadingState from './ui/LoadingState';
import './AboutSheet.css';

interface AboutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string | null;
}

// F-235 Slice A: real venue-info content, ported from BranchAbout.tsx (orphaned since Phase 0's
// route collapse) -- same fetch, same guards preserved exactly: hasCoordinates via explicit
// Number.isFinite (not truthiness, so a branch at lat/lng 0 still works correctly),
// googlePlaceId-gated review link, real-photos-only gallery (no stock/third-party fallback --
// hard boundary, not weakened here). Bottom-sheet shell cloned from AccountSheet.tsx.
export default function AboutSheet({ open, onOpenChange, branchId }: AboutSheetProps) {
  const { accessToken } = useAuth();
  const [aboutData, setAboutData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !branchId) return;
    setLoading(true);
    apiRequest<any>(`/tenant/branches/${branchId}/about`, { token: accessToken })
      .then(setAboutData)
      .catch(() => setAboutData(null))
      .finally(() => setLoading(false));
  }, [open, branchId, accessToken]);

  // Same explicit Number.isFinite guard as BranchAbout.tsx -- 0 is a real, valid coordinate
  // (lat 0, lng 0 sits in the Gulf of Guinea), so a truthiness test would silently hide the
  // directions link for any branch sitting on the equator or prime meridian.
  const hasCoordinates =
    !!aboutData &&
    typeof aboutData.latitude === 'number' && Number.isFinite(aboutData.latitude) &&
    typeof aboutData.longitude === 'number' && Number.isFinite(aboutData.longitude);
  const photos: string[] = Array.isArray(aboutData?.photos) ? aboutData.photos : [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="gpwa-about-sheet__overlay" />
        <Dialog.Content className="gpwa-about-sheet__content">
          <div className="gpwa-about-sheet__header">
            <Dialog.Title className="gpwa-about-sheet__title">About the venue</Dialog.Title>
            <Dialog.Close asChild>
              <button className="gpwa-about-sheet__close" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="gpwa-about-sheet__body">
            {loading ? (
              <LoadingState variant="compact" label="Loading venue info…" />
            ) : !aboutData ? (
              <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '13px', color: 'var(--color-neutral-600)', textAlign: 'center', padding: '24px 0' }}>
                Couldn't load venue info.
              </p>
            ) : (
              <div className="space-y-5">
                {aboutData.address && (
                  <div className="flex items-start gap-2" style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--color-accent-700)' }} />
                    <span>{aboutData.address}</span>
                  </div>
                )}

                {(hasCoordinates || aboutData.googlePlaceId) && (
                  <div className="flex flex-wrap items-center gap-2.5">
                    {hasCoordinates && (
                      <a
                        id="branch-directions-link"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${aboutData.latitude},${aboutData.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2"
                        style={{ minHeight: '44px', padding: '0 16px', background: 'var(--color-accent-700)', borderRadius: '14px', fontFamily: 'var(--font-body-organic)', fontSize: '13px', fontWeight: 700, color: 'var(--color-accent-100)' }}
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
                        className="inline-flex items-center gap-2"
                        style={{ minHeight: '44px', padding: '0 16px', background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', borderRadius: '14px', fontFamily: 'var(--font-body-organic)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}
                      >
                        <Star className="h-4 w-4" />
                        <span>Leave a review</span>
                      </a>
                    )}
                  </div>
                )}

                {aboutData.description && (
                  <div className="space-y-1.5">
                    <div style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
                      VISION AND MISSION
                    </div>
                    <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '13px', lineHeight: 1.6, color: 'var(--color-neutral-800)' }}>
                      {aboutData.description}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
                    <Clock className="h-4 w-4" style={{ color: 'var(--color-accent-700)' }} />
                    <span>WORKING SCHEDULE</span>
                  </div>
                  <div className="font-mono space-y-1" style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--color-neutral-700)' }}>
                    <div>
                      Days <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{aboutData.workingDays?.join(', ') || 'All days'}</span>
                    </div>
                    {aboutData.workingHoursStart && aboutData.workingHoursEnd && (
                      <div>
                        Hours <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{aboutData.workingHoursStart} – {aboutData.workingHoursEnd}</span>
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
                    <div className="flex flex-wrap gap-2">
                      {aboutData.facilities.map((fac: string, idx: number) => (
                        <span
                          key={idx}
                          style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11.5px', fontWeight: 600, color: 'var(--color-neutral-700)', background: 'var(--color-neutral-200)', border: '1px solid var(--color-neutral-300)', padding: '5px 12px', borderRadius: '999px' }}
                        >
                          {fac}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
                    <ImageIcon className="h-4 w-4" style={{ color: 'var(--color-accent-700)' }} />
                    <span>PHOTOS</span>
                  </div>
                  {photos.length === 0 ? (
                    <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12px', color: 'var(--color-neutral-600)' }}>
                      No photos yet for this venue.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {photos.map((photoUrl: string, idx: number) => (
                        <div key={idx} className="relative aspect-video overflow-hidden" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-300)' }}>
                          <img src={photoUrl} alt={`Venue photo ${idx + 1}`} className="h-full w-full object-cover" style={{ filter: 'saturate(0.72) contrast(0.94)' }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
