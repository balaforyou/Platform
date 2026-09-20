import { jsPDF } from 'jspdf';
import { formatBookingReference, formatBranchTime } from '@badminton/ui-shared';
import { describeCourtAssignment } from './courtLabel';

// F-235 Slice F / design brief §0.6: client-side PDF receipt, generated entirely from data
// already on the confirmation screen (booking + branchAbout) -- no new fetch, no backend
// endpoint. Content per the design brief: venue, date/time, court/pool, price, booking
// reference, status.
function buildBookingRows(booking: any, branchAbout: any): [string, string][] {
  const court = describeCourtAssignment(booking.resource?.name, booking.resourceId, booking.courtSlotIndex) ?? 'Not yet assigned';
  const startTime = booking.window?.startTime;
  const endTime = booking.window?.endTime;
  return [
    ['Booking Reference', formatBookingReference(booking.id)],
    ['Status', String(booking.status || '')],
    [
      'Date',
      startTime ? formatBranchTime(startTime, branchAbout?.timezone, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—',
    ],
    [
      'Time',
      startTime && endTime
        ? `${formatBranchTime(startTime, branchAbout?.timezone, { hour: '2-digit', minute: '2-digit' })} - ${formatBranchTime(endTime, branchAbout?.timezone, { hour: '2-digit', minute: '2-digit' })}`
        : '—',
    ],
    ['Venue', branchAbout?.name || '—'],
    ['Court', court],
    ['Players', String(1 + (booking.players?.length || 0))],
    ['Amount Paid', `Rs. ${Number(booking.price)}`],
  ];
}

function renderReceipt(title: string, booking: any, branchAbout: any, tenantName: string | undefined, extraRows: [string, string][], footerNote: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 48;
  let y = 64;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, left, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(tenantName || 'Court Booking', left, y);
  y += 32;

  const rows = [...buildBookingRows(booking, branchAbout), ...extraRows];

  doc.setFontSize(12);
  for (const [label, value] of rows) {
    doc.setTextColor(120, 120, 120);
    doc.text(label, left, y);
    doc.setTextColor(20, 20, 20);
    doc.text(value, left + 160, y);
    y += 24;
  }

  y += 16;
  doc.setDrawColor(210, 210, 210);
  doc.line(left, y, 548, y);
  y += 24;
  doc.setFontSize(9);
  doc.setTextColor(140, 140, 140);
  doc.text(footerNote, left, y);

  return doc;
}

export function downloadBookingReceipt(booking: any, branchAbout: any, tenantName?: string) {
  const doc = renderReceipt(
    'Booking Receipt',
    booking,
    branchAbout,
    tenantName,
    [],
    'This receipt was generated at the time of download and reflects the booking record at that moment.',
  );
  doc.save(`${formatBookingReference(booking.id)}-receipt.pdf`);
}

// F-235 Slice G / design brief §0.6 (second half): cancellation receipt, capturing the real
// refund breakdown already computed by GET /bookings/:id/cancel-preview and already on screen in
// CancelBookingModal -- no new fetch. refundPreview is that same { originalPrice, refundPercent,
// refundAmount } shape CancelBookingModal already renders.
export function downloadCancellationReceipt(
  booking: any,
  branchAbout: any,
  refundPreview: { originalPrice: number; refundPercent: number; refundAmount: number },
  tenantName?: string,
) {
  const doc = renderReceipt(
    'Cancellation Receipt',
    booking,
    branchAbout,
    tenantName,
    [
      ['Original Price', `Rs. ${Number(refundPreview.originalPrice)}`],
      ['Refund Percent', `${refundPreview.refundPercent}%`],
      ['Refund Amount', `Rs. ${Number(refundPreview.refundAmount)}`],
    ],
    'This receipt was generated at the time of download and reflects the cancellation record at that moment.',
  );
  doc.save(`${formatBookingReference(booking.id)}-cancellation-receipt.pdf`);
}
