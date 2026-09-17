import { jsPDF } from 'jspdf';
import { formatBookingReference, formatBranchTime } from '@badminton/ui-shared';

// F-235 Slice F / design brief §0.6: client-side PDF receipt, generated entirely from data
// already on the confirmation screen (booking + branchAbout) -- no new fetch, no backend
// endpoint. Content per the design brief: venue, date/time, court/pool, price, booking
// reference, status.
export function downloadBookingReceipt(booking: any, branchAbout: any, tenantName?: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 48;
  let y = 64;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Booking Receipt', left, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(tenantName || 'Court Booking', left, y);
  y += 32;

  const court = booking.resource?.name ?? (booking.courtSlotIndex != null ? `Court ${booking.courtSlotIndex}` : 'Not yet assigned');
  const startTime = booking.window?.startTime;
  const endTime = booking.window?.endTime;
  const rows: [string, string][] = [
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
  doc.text('This receipt was generated at the time of download and reflects the booking record at that moment.', left, y);

  doc.save(`${formatBookingReference(booking.id)}-receipt.pdf`);
}
