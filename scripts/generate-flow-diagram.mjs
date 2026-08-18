#!/usr/bin/env node
/**
 * Generates a navigable drawio capability/flow map from the reverse-engineering
 * extraction (RE-003/RE-004/RE-006/RE-011 + code-derived handler reads).
 *
 * WHY THIS EXISTS: the diagram encodes finding ids and route auth state at a point in
 * time, so it goes stale the moment a finding is resolved or a guard changes. F-097 went
 * stale within one commit of the diagram being created, and was only caught by inspecting
 * the raw file. Regenerating is the sync mechanism; hand-editing the .drawio is not.
 *
 * WHY NODE AND NOT PYTHON: this repo declares Node, not Python. F-056 is the standing
 * lesson — a repo tool that depends on an interpreter or binary the project does not
 * declare will eventually fail on a machine that does not happen to have it.
 *
 * ---------------------------------------------------------------------------
 * EXTENDING SCOPE — the whole point of the data/builder split below.
 *
 * To diagram capabilities beyond the v1 demo scope you add data, never builder code:
 *   1. Add any missing flows to FLOWS (id -> name, endpoint, auth class, findings,
 *      RE-006 transition).
 *   2. Add a CAPABILITIES entry (title, coverage note, member flows, edges, notes).
 *      Optionally set layout:'groups' to group flows by real screen, as CAP-010 does.
 *   3. List the capability id in a SCOPES entry — either an existing scope or a new one.
 *
 * Then:  node scripts/generate-flow-diagram.mjs --scope <name> --out <path>
 *
 * Nothing below the DATA section needs touching to add a capability, a flow, a journey,
 * or an entire new scope.
 * ---------------------------------------------------------------------------
 *
 * Usage:
 *   node scripts/generate-flow-diagram.mjs                      # default scope -> default out
 *   node scripts/generate-flow-diagram.mjs --scope v1-demo --out docs/map.drawio
 *   node scripts/generate-flow-diagram.mjs --list              # show scopes, caps, flows
 *   node scripts/generate-flow-diagram.mjs --check             # build without writing
 *   node scripts/generate-flow-diagram.mjs --verify-register   # fail on diagram/register drift
 *
 * --verify-register is the enforcement half of the sync rule. It exits 1 when any finding
 * tag on a drawn node disagrees with that finding's section in docs/findings_register.md:
 * a tag that is Resolved but still shown open, a tag marked "(fixed)" that the register
 * still has under Open, or a tag that is not in the register at all. Run it the way
 * deploy:verify is run — as a gate, not a report nobody reads.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { argv, exit } from 'node:process';

/** Repo root resolved from this file, so the register check works from any cwd. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ===========================================================================
// DATA — everything scope-specific lives here.
// ===========================================================================

/** Auth classes drive node colour. 'none' means a real defect, not a design choice. */
const AUTH = {
  authed:   { fill: '#d5e8d4', stroke: '#82b366', label: 'authenticated' },
  none:     { fill: '#f8cecc', stroke: '#b85450', label: 'NO auth (defect)' },
  public:   { fill: '#fff2cc', stroke: '#d6b656', label: 'public by design' },
  provider: { fill: '#ffe6cc', stroke: '#d79b00', label: 'provider signature' },
  module:   { fill: '#e1d5e7', stroke: '#9673a6', label: 'no endpoint (module)' },
  test:     { fill: '#f5f5f5', stroke: '#999999', label: 'test-only' },
};

const FLOWS = {
  'FLOW-019': { name: 'Create Resource Pool', endpoint: 'POST /resource-pools', auth: 'authed', findings: ['F-091 (fixed)'] },
  'FLOW-020': { name: 'Update Resource Pool', endpoint: 'PATCH /resource-pools/:id', auth: 'authed', findings: [] },
  'FLOW-021': { name: 'Add Resource to Pool', endpoint: 'POST /resource-pools/:id/resources', auth: 'authed', findings: ['F-091 (fixed)'] },
  'FLOW-022': { name: 'Browse Branch Resource Pools', endpoint: 'GET /branches/:id/resource-pools', auth: 'authed', findings: ['F-091 (fixed)'] },

  'FLOW-023': { name: 'Create Availability Window', endpoint: 'POST /resource-pools/:id/availability-windows', auth: 'authed', findings: ['F-043', 'F-087', 'F-088', 'F-091 (fixed)'] },
  'FLOW-024': { name: 'Browse Availability', endpoint: 'GET /resource-pools/:id/availability', auth: 'public', findings: ['F-051', 'F-080', 'F-088'] },
  'FLOW-025': { name: 'Manage Availability Patterns', endpoint: 'GET/POST/PATCH/DELETE .../availability-patterns', auth: 'authed', findings: ['F-043', 'F-088'] },
  'FLOW-026': { name: 'Manage Availability Overrides', endpoint: 'GET/POST/PATCH/DELETE .../availability-overrides', auth: 'authed', findings: ['F-043', 'F-088'] },
  'FLOW-027': { name: 'Block Availability Window', endpoint: 'POST /blocked-windows', auth: 'authed', findings: ['F-051', 'F-091 (fixed)'] },
  'FLOW-028': { name: 'Generate Availability', endpoint: '(no endpoint - availabilityGeneration.ts)', auth: 'module', findings: ['F-046', 'F-088'] },

  'FLOW-029': { name: 'Create Booking', endpoint: 'POST /bookings', auth: 'authed', findings: ['F-023', 'F-028', 'F-080'], transition: 'TRANSITION-BOOKING-001' },
  'FLOW-031': { name: 'View Booking', endpoint: 'GET /bookings/:id', auth: 'authed', findings: ['F-037 (fixed)'] },
  'FLOW-032': { name: 'View My Bookings', endpoint: 'GET /bookings/my', auth: 'authed', findings: ['F-093', 'F-094'] },
  'FLOW-033': { name: 'View Admin Bookings', endpoint: 'GET /bookings/admin', auth: 'authed', findings: [] },
  'FLOW-034': { name: 'Confirm Booking', endpoint: 'POST /bookings/:id/confirm', auth: 'authed', findings: [], transition: 'TRANSITION-BOOKING-003 / -004' },
  'FLOW-035': { name: 'Check In Booking', endpoint: 'POST /bookings/:id/check-in', auth: 'authed', findings: ['F-090 (fixed)', 'F-093', 'F-094'], transition: 'TRANSITION-BOOKING-005' },
  'FLOW-036': { name: 'Preview Booking Cancellation', endpoint: 'GET /bookings/:id/cancel-preview', auth: 'authed', findings: [] },
  'FLOW-037': { name: 'Cancel Booking', endpoint: 'POST /bookings/:id/cancel', auth: 'authed', findings: ['F-092'], transition: 'TRANSITION-BOOKING-006 / -007 / -008' },

  'FLOW-038': { name: 'Create Booking Rule', endpoint: 'POST /booking-rules', auth: 'authed', findings: ['F-080'] },
  'FLOW-039': { name: 'Update Resource Pool Booking Rule', endpoint: 'PUT /resource-pools/:id/booking-rule', auth: 'authed', findings: ['F-065 (fixed)', 'F-063'] },

  'FLOW-045': { name: 'View Guest Occupancy', endpoint: 'GET /branches/:id/guest-occupancy', auth: 'authed', findings: ['F-063'] },
  'FLOW-046': { name: 'View Member Attendance', endpoint: 'GET /branches/:id/member-attendance', auth: 'authed', findings: ['F-042', 'F-063'] },
  'FLOW-047': { name: 'View Resource Pool Occupancy', endpoint: 'GET /resource-pools/:id/occupancy', auth: 'authed', findings: ['F-005', 'F-031', 'F-062', 'F-091 (fixed)'] },
  'FLOW-048': { name: 'Release Capacity', endpoint: 'POST /resource-pools/:id/windows/:windowId/release', auth: 'authed', findings: ['F-023', 'F-044', 'F-065 (fixed)'] },
  'FLOW-049': { name: 'Run Booking Sweep', endpoint: 'POST /bookings/sweep', auth: 'authed', findings: ['F-044', 'F-046', 'F-063', 'F-065 (fixed)', 'F-066', 'F-073'], transition: 'TRANSITION-BOOKING-009 / -012' },

  'FLOW-050': { name: 'Create Payment Intent', endpoint: 'POST /payments/intents', auth: 'authed', findings: ['F-026', 'F-037 (fixed)', 'F-081'] },
  'FLOW-051': { name: 'Create Payment Order', endpoint: 'POST /payments/create-order', auth: 'authed', findings: ['F-026', 'F-027', 'F-038', 'F-081'], transition: 'TRANSITION-PAYMENT-INTENT-003' },
  'FLOW-052': { name: 'Verify Payment', endpoint: 'POST /payments/verify-payment', auth: 'authed', findings: ['F-034', 'F-038', 'F-050', 'F-081'], transition: 'TRANSITION-PAYMENT-INTENT-001' },
  'FLOW-054': { name: 'Process Razorpay Payment Webhook', endpoint: 'POST /webhooks/razorpay', auth: 'provider', findings: ['F-026', 'F-033', 'F-081', 'F-082'], transition: 'TRANSITION-PAYMENT-INTENT-002' },
  'FLOW-058': { name: 'Simulate Payment Capture', endpoint: 'POST /payments/test/simulate-capture', auth: 'test', findings: ['(test-only)'] },
  // F-097 fixed in 000ab4b: requirePaymentLinkAdmin (internal key OR owner/branch_manager JWT).
  'FLOW-059': { name: 'Create Refund', endpoint: 'POST /refunds', auth: 'authed', findings: ['F-026', 'F-082', 'F-097 (fixed)'], transition: 'TRANSITION-REFUND-001' },
  'FLOW-060': { name: 'Override Refund', endpoint: 'POST /refunds/override', auth: 'authed', findings: ['F-026'] },
};

const CAPABILITIES = {
  'CAP-005': {
    title: 'CAP-005 · Resource Management',
    coverage: "4 flows &bull; <font color='#b85450'>0 rule coverage</font>",
    flows: ['FLOW-019', 'FLOW-020', 'FLOW-021', 'FLOW-022'],
    edges: [['FLOW-019', 'FLOW-020', ''], ['FLOW-019', 'FLOW-021', ''], ['FLOW-019', 'FLOW-022', '']],
    notes:
      '<b>Gap flags</b><br>' +
      '&bull; <b>Zero RE-010 rule coverage</b> for all four flows — no rules, policies, invariants, authz rules or transitions.<br>' +
      '&bull; RE-003/RE-004 never state what fields FLOW-019 accepts, what FLOW-020 validates, or how FIXED_INSTANCE vs POOLED changes behaviour.<br>' +
      "&bull; RE-004 called FLOW-019/021 'auth uncertainty in Phase 4'. That resolved as a <b>defect</b>, not an unknown — 3 of 4 flows had no auth — and is now <b>fixed</b> (F-091, aea242f). FLOW-019 additionally derives tenantId from the token rather than the body, per F-045.<br>" +
      '&bull; <b>FLOW-019 and FLOW-021 have no admin UI at all</b> (F-098) — ResourcesPage can only update an existing pool. Every pool in this project came from seed scripts or the provisioning script. Real scale is 17+ batch groups, so the eventual UI needs bulk creation, not a single-pool form.',
  },
  'CAP-006': {
    title: 'CAP-006 · Availability &amp; Scheduling',
    coverage: "6 flows &bull; <font color='#b85450'>5 of 6 uncovered</font>",
    flows: ['FLOW-023', 'FLOW-025', 'FLOW-026', 'FLOW-027', 'FLOW-028', 'FLOW-024'],
    edges: [['FLOW-023', 'FLOW-024', ''], ['FLOW-025', 'FLOW-028', ''], ['FLOW-026', 'FLOW-028', ''], ['FLOW-027', 'FLOW-024', ''], ['FLOW-028', 'FLOW-024', '']],
    notes:
      '<b>Gap flags</b><br>' +
      '&bull; <b>FLOW-028 has no endpoint and no established flow boundary</b> (FLOW-DISCOVERY-UNCERTAINTY-001). It is a module invoked lazily by 024/045/047 — do not draw it with an initiator.<br>' +
      '&bull; FLOW-024 remains public <i>by design</i> (BR-048). FLOW-023 and FLOW-027 were unauthenticated by defect and are now guarded (F-091, aea242f).<br>' +
      '&bull; Whole capability is downstream of F-088 (Branch.timezone unreachable; every branch reports UTC).<br>' +
      '&bull; Only FLOW-024 has RE-010 rule coverage; the other five have none.',
  },
  'CAP-007': {
    title: 'CAP-007 · Booking Management',
    coverage: '8 flows &bull; full coverage',
    flows: ['FLOW-029', 'FLOW-034', 'FLOW-035', 'FLOW-031', 'FLOW-032', 'FLOW-033', 'FLOW-036', 'FLOW-037'],
    edges: [['FLOW-029', 'FLOW-034', ''], ['FLOW-034', 'FLOW-035', ''], ['FLOW-034', 'FLOW-031', ''], ['FLOW-034', 'FLOW-032', ''], ['FLOW-034', 'FLOW-033', ''], ['FLOW-034', 'FLOW-036', ''], ['FLOW-036', 'FLOW-037', '']],
    notes:
      '<b>Notes</b><br>' +
      '&bull; FLOW-035 reflects the <b>F-090 fix as merged (0e94800)</b>: requireInternalKey || requireUserJwt, then requireBookingAccess before the idempotent early-return. Any earlier snapshot shows no auth at all.<br>' +
      '&bull; FLOW-034 does not verify hold expiry or payment state (STATE-CONFLICT-002) — payment capture is treated as the upstream precondition.<br>' +
      '&bull; FLOW-036 computes without writing; FLOW-037 persists status + refundAmount but does <b>not</b> create a Refund row.<br>' +
      '&bull; Cancel accepts only HELD/CONFIRMED, so CHECKED_IN is terminal for the refund path (drives F-093).',
  },
  'CAP-008': {
    title: 'CAP-008 · Booking Rule Configuration',
    coverage: "2 flows &bull; <font color='#b85450'>0 rule coverage</font>",
    flows: ['FLOW-038', 'FLOW-039'],
    edges: [],
    cols: 2,
    notes:
      '<b>Gap flags — the thinnest capability in the set</b><br>' +
      '&bull; <b>Zero RE-010 rule coverage</b> for both flows, and <b>no RE-004 journey of its own</b> — RE-011 folds 038/039 into Availability Management.<br>' +
      '&bull; RE-003/RE-004 never enumerate a single field of <code>BookingRule</code>, despite this capability governing the config behind ' +
      '<b>F-005</b> (lowOccupancyThresholdPct), <b>F-051</b> (guestOpenWindowDays), and <b>F-065</b> (gracePeriodMinutes vs guestAccessCutoffMinutes).<br>' +
      '&bull; Any rule-semantics view must be built from schema.prisma and the handlers. <b>The RE set does not contain the material.</b>',
  },
  'CAP-010': {
    title: 'CAP-010 · Occupancy &amp; Capacity Release',
    subtitle: "<font size='10' color='#b85450'>grouped by real screen (F-096 correction)</font>",
    coverage: "5 flows &bull; <font color='#b85450'>3 of 5 uncovered</font>",
    layout: 'groups',
    groups: [
      { label: "Overview()  &nbsp;<font size='9'>admin-web main.tsx:610</font>", flows: ['FLOW-045', 'FLOW-046'], fill: '#f0f7ff', stroke: '#6c8ebf' },
      { label: "OccupancyPage()  &nbsp;<font size='9'>main.tsx:1236 &bull; nav label \"Low Occupancy\" (main.tsx:430)</font>", flows: ['FLOW-047', 'FLOW-048'], fill: '#fff8f0', stroke: '#d79b00' },
      { label: "No admin UI  &nbsp;<font size='9'>internal-key endpoint only</font>", flows: ['FLOW-049'], fill: '#f5f5f5', stroke: '#999999' },
    ],
    edges: [['FLOW-047', 'FLOW-048', '']],
    notes:
      "<b>F-096 correction applied.</b> RE-003's Executable Entry Evidence claims <code>OccupancyPage</code> for all four of " +
      'FLOW-045/046/047/048. Verified against source: <b>045 and 046 actually render in Overview()</b> ' +
      "(main.tsx:618-620 and :623-625); only 047 and 048 are on OccupancyPage. Cross-corroborated by the register's own F-041.<br><br>" +
      "<b>FLOW-046 inclusion:</b> kept here on RE-003's Primary Capability tag (CAP-010). RE-004 places it in the " +
      '<i>Member Assignment &amp; Attendance</i> journey — that is an <b>orthogonal axis, not a contradiction</b>: capability vs journey. ' +
      'It pairs with FLOW-045 on the same screen, which is the strongest argument for keeping it in this view.<br><br>' +
      '<b>Two capacity formulas, deliberately different.</b> computePoolGuestOccupancy filters isMemberBooking:false (intentional, per F-035/F-041/F-063); ' +
      'FLOW-024 counts HELD+CONFIRMED regardless. This is STATE-CONFLICT-001 — <b>do not draw 045 and 024 as sharing a computation</b>.',
  },
  'CAP-011': {
    title: 'CAP-011 / CAP-012 · Payment &amp; Refund',
    coverage: '7 flows &bull; full coverage',
    flows: ['FLOW-050', 'FLOW-051', 'FLOW-052', 'FLOW-054', 'FLOW-058', 'FLOW-059', 'FLOW-060'],
    edges: [['FLOW-050', 'FLOW-051', ''], ['FLOW-051', 'FLOW-052', ''], ['FLOW-051', 'FLOW-054', ''], ['FLOW-051', 'FLOW-058', 'test only'], ['FLOW-058', 'FLOW-054', 'test only'], ['FLOW-059', 'FLOW-060', '']],
    cols: 4,
    notes:
      '<b>Notes</b><br>' +
      '&bull; <b>FLOW-059 real handler is payment/src/index.ts:595-679</b>. Lines 696-820 belong to /payment-links (FLOW-056) and were misattributed by the first mechanical pass.<br>' +
      '&bull; <b>F-097 fixed (000ab4b)</b> — FLOW-059 now uses requirePaymentLinkAdmin (internal key OR owner/branch_manager JWT). Its sibling FLOW-060 keeps a JWT-only guard because it records an accountable adminId.<br>' +
      '&bull; FLOW-052 and FLOW-054 both capture then call Slot Engine FLOW-034 across a service boundary — non-atomic (XFLOW-GAP-001, INTEGRATION-FINDING-001).<br>' +
      "&bull; FLOW-058 is test-only and calls the service's <b>own</b> webhook endpoint. Dashed test path, not production.",
  },
};

const JOURNEYS = {
  'guest-booking': {
    title: 'Journey · Guest Booking + Payment',
    heading: '<b>Cross-flow journey · Guest Booking + Payment (end-to-end)</b>',
    nodes: [
      ['FLOW-024', 40, 130], ['FLOW-029', 340, 130], ['FLOW-050', 640, 130], ['FLOW-051', 940, 130],
      ['FLOW-052', 640, 270], ['FLOW-054', 940, 270], ['FLOW-034', 340, 270], ['FLOW-049', 40, 270],
      ['FLOW-035', 40, 410], ['FLOW-031', 340, 410], ['FLOW-032', 640, 410], ['FLOW-033', 940, 410],
      ['FLOW-036', 340, 550], ['FLOW-037', 640, 550], ['FLOW-059', 940, 550], ['FLOW-060', 1240, 550],
    ],
    edges: [
      ['FLOW-024', 'FLOW-029', ''], ['FLOW-029', 'FLOW-050', ''], ['FLOW-050', 'FLOW-051', ''],
      ['FLOW-051', 'FLOW-052', ''], ['FLOW-051', 'FLOW-054', ''], ['FLOW-052', 'FLOW-034', ''],
      ['FLOW-054', 'FLOW-034', ''], ['FLOW-034', 'FLOW-031', ''], ['FLOW-034', 'FLOW-032', ''],
      ['FLOW-034', 'FLOW-033', ''], ['FLOW-034', 'FLOW-035', ''], ['FLOW-034', 'FLOW-036', ''],
      ['FLOW-036', 'FLOW-037', ''], ['FLOW-037', 'FLOW-059', ''], ['FLOW-059', 'FLOW-060', ''],
      ['FLOW-049', 'FLOW-029', 'releases stale HELD', 'dashed=1;strokeColor=#b85450;'],
    ],
    notes:
      '<b>RE-011 journey integrity (current file)</b><br>' +
      'Standard Guest Booking <b>WEAK</b> &bull; Booking Confirmation <b>WEAK</b> &bull; Check-In <b>WEAK</b> &bull; ' +
      'Payment <b>WEAK</b> &bull; Refund <b>INCOMPLETE</b> &bull; Cancellation CONSISTENT_WITH_VARIANTS<br><br>' +
      "<b>Edges are RE-004's reconstruction, not an established contract.</b> FLOW-DISCOVERY-UNCERTAINTY-002 states RE-003 could not " +
      'determine the lifecycle/ownership boundary between booking, payment, cancellation and refund — precisely this chain.<br>' +
      '<b>FLOW-037 does not create a Refund row</b>; FLOW-059 is a separate journey (XFLOW-GAP-003).',
  },
};

/** A scope is the unit you invoke. Add one to diagram a different slice. */
const SCOPES = {
  'v1-demo': {
    title: 'Reverse-Engineered Capability &amp; Flow Map — v1 (demo scope)',
    out: 'docs/re_capability_flow_map_v1.drawio',
    capabilities: ['CAP-005', 'CAP-006', 'CAP-008', 'CAP-007', 'CAP-010', 'CAP-011'],
    journeys: ['guest-booking'],
    // grid position on the capability map page, per capability id
    mapLayout: {
      'CAP-005': [40, 120], 'CAP-006': [340, 120], 'CAP-008': [640, 120],
      'CAP-010': [40, 300], 'CAP-007': [340, 300], 'CAP-011': [640, 300],
    },
    mapEdges: [['CAP-005', 'CAP-006'], ['CAP-006', 'CAP-007'], ['CAP-008', 'CAP-007'], ['CAP-005', 'CAP-010'], ['CAP-007', 'CAP-010'], ['CAP-007', 'CAP-011']],
    caveats:
      '<b>Source caveats — read before trusting this map</b><br>' +
      '&bull; RE-003 has <b>no step sequences</b>. All step detail is code-derived, not RE-derived.<br>' +
      '&bull; 11 of 32 in-scope flows have <b>zero</b> RE-010 rule/policy/invariant/authz coverage.<br>' +
      "&bull; RE-003 'Executable Entry Evidence' is unreliable for <b>screen</b> mapping (F-096) —<br>" +
      '&nbsp;&nbsp;backend endpoints checked out, frontend components did not.<br>' +
      '&bull; FLOW-028 has no endpoint and no established flow boundary (FLOW-DISCOVERY-UNCERTAINTY-001).<br>' +
      '&bull; <b>Regenerate, never hand-edit</b> — see scripts/generate-flow-diagram.mjs.',
  },
};

// ===========================================================================
// BUILDER — generic. Adding capabilities/flows/scopes requires no edits below.
// ===========================================================================

const S = {
  node:  'rounded=1;whiteSpace=wrap;html=1;verticalAlign=top;spacing=4;fontSize=10;',
  cap:   'rounded=1;whiteSpace=wrap;html=1;verticalAlign=top;spacing=6;fontSize=12;',
  group: 'rounded=0;whiteSpace=wrap;html=1;dashed=1;verticalAlign=top;fontSize=11;fontStyle=1;',
  edge:  'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;fontSize=9;endArrow=block;',
  note:  'shape=note;whiteSpace=wrap;html=1;size=14;verticalAlign=top;align=left;fontSize=10;',
  capBox:'fillColor=#dae8fc;strokeColor=#6c8ebf;',
  grey:  'fillColor=#f5f5f5;strokeColor=#999999;',
  text:  'text;html=1;align=left;',
};

/** XML-escape for an attribute. Labels carry raw HTML that drawio re-parses after XML
 *  unescaping, so escaping happens exactly once, here.
 *
 *  WHY EVERY AMPERSAND, WITH NO EXCEPTIONS: the label text contains HTML entities such as
 *  &bull; and &nbsp;, which XML does not predefine — leaving them bare makes the file
 *  "undefined entity" and drawio will not open it. Escaping unconditionally is also correct
 *  for entities already written as &amp;: it yields &amp;amp;, which XML-unescapes to
 *  &amp; and then renders through drawio's HTML pass as a literal ampersand. */
const A = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const LEGEND = '<b>Legend</b><br>' +
  Object.values(AUTH).map((a) => `<font color='${a.stroke}'>&#9632;</font> ${a.label}`).join(' &nbsp; ') +
  '<br>Blue line = RE-006 transition &nbsp; Red text = finding id';

function flowNode(id, fid, x, y, w = 250, h = 86) {
  const f = FLOWS[fid];
  if (!f) throw new Error(`unknown flow id referenced: ${fid}`);
  const a = AUTH[f.auth];
  if (!a) throw new Error(`unknown auth class '${f.auth}' on ${fid}`);
  let lbl = `<b>${fid}</b><br><i>${f.name}</i><br><font size='9' color='#555555'>${f.endpoint}</font>`;
  if (f.transition) lbl += `<br><font size='8' color='#6c8ebf'>${f.transition}</font>`;
  if (f.findings?.length) lbl += `<br><font size='8' color='#b85450'>${f.findings.join(' ')}</font>`;
  return `<mxCell id="${id}" value="${A(lbl)}" style="${S.node}fillColor=${a.fill};strokeColor=${a.stroke};" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
}

function box(id, label, x, y, w, h, style, link) {
  const geo = `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>`;
  if (link) return `<object label="${A(label)}" link="data:page/id,${link}" id="${id}"><mxCell style="${style}" vertex="1" parent="1">${geo}</mxCell></object>`;
  return `<mxCell id="${id}" value="${A(label)}" style="${style}" vertex="1" parent="1">${geo}</mxCell>`;
}

const edge = (id, s, t, label = '', extra = '') =>
  `<mxCell id="${id}" value="${A(label)}" style="${S.edge}${extra}" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

const page = (id, name, cells) =>
  `<diagram id="${id}" name="${A(name)}"><mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1100" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram>`;

const nid = (fid) => 'n' + fid.slice(-3);

function capabilityMapPage(scope) {
  const c = [
    box('t', `<b>${scope.title}</b><br><font size='10'>Keyed to real FLOW-/CAP- IDs. Click any capability to open its flow page.</font>`, 40, 20, 900, 50, S.text + 'fontSize=16;'),
    box('lg', LEGEND, 1120, 20, 440, 100, S.note),
  ];
  for (const capId of scope.capabilities) {
    const cap = CAPABILITIES[capId];
    if (!cap) throw new Error(`scope references unknown capability: ${capId}`);
    const [x, y] = scope.mapLayout[capId] ?? [40, 120];
    const label = `<b>${capId}</b><br>${cap.title.split('· ')[1] ?? cap.title}<br><font size='9' color='#555555'>${cap.coverage}</font>`;
    c.push(box('m' + capId, label, x, y, 260, 80, S.cap + S.capBox, capId.toLowerCase()));
  }
  scope.journeys.forEach((jid, i) => {
    const j = JOURNEYS[jid];
    if (!j) throw new Error(`scope references unknown journey: ${jid}`);
    c.push(box('mj' + i, `<b>JOURNEY</b><br>${j.title.split('· ')[1] ?? j.title}<br><font size='9' color='#555555'>cross-flow view</font>`, 340, 480, 260, 80, S.cap + S.capBox, jid));
  });
  (scope.mapEdges ?? []).forEach(([a, b], i) => c.push(edge(`ce${i}`, 'm' + a, 'm' + b)));
  if (scope.caveats) c.push(box('n0', scope.caveats, 40, 600, 700, 155, S.note));
  return page('cap-map', '0 · Capability Map', c);
}

function capabilityPage(capId) {
  const cap = CAPABILITIES[capId];
  const c = [
    box('t', `<b>${cap.title}</b>${cap.subtitle ? ' &nbsp;' + cap.subtitle : ''}`, 40, 20, 1000, 30, S.text + 'fontSize=15;'),
    box('bk', '&#8592; Capability Map', 1380, 20, 180, 30, S.cap + S.grey, 'cap-map'),
    box('lg', LEGEND, 1120, 60, 440, 100, S.note),
  ];
  let notesY;
  if (cap.layout === 'groups') {
    let gx = 40;
    cap.groups.forEach((g, gi) => {
      const w = 300 * g.flows.length + 20;
      c.push(box('g' + gi, g.label, gx, 120, w, 180, `${S.group}fillColor=${g.fill};strokeColor=${g.stroke};`));
      g.flows.forEach((fid, i) => c.push(flowNode(nid(fid), fid, gx + 20 + i * 290, 160, 270)));
      gx += w + 40;
    });
    notesY = 340;
  } else {
    const cols = cap.cols ?? 3;
    cap.flows.forEach((fid, i) => c.push(flowNode(nid(fid), fid, 40 + (i % cols) * 290, 110 + Math.floor(i / cols) * 130)));
    notesY = 110 + (Math.floor((cap.flows.length - 1) / cols) + 1) * 130 + 20;
  }
  (cap.edges ?? []).forEach(([a, b, l], i) => c.push(edge(`e${i}`, nid(a), nid(b), l)));
  if (cap.notes) c.push(box('nt', cap.notes, 40, notesY, 1200, 190, S.note));
  return page(capId.toLowerCase(), cap.title.replace(/<[^>]+>/g, ''), c);
}

function journeyPage(jid) {
  const j = JOURNEYS[jid];
  const c = [
    box('t', j.heading, 40, 20, 900, 30, S.text + 'fontSize=15;'),
    box('bk', '&#8592; Capability Map', 1380, 20, 180, 30, S.cap + S.grey, 'cap-map'),
    box('lg', LEGEND, 1120, 60, 440, 100, S.note),
  ];
  j.nodes.forEach(([fid, x, y]) => c.push(flowNode('j' + fid.slice(-3), fid, x, y)));
  j.edges.forEach(([a, b, l, st], i) => c.push(edge(`je${i}`, 'j' + a.slice(-3), 'j' + b.slice(-3), l, st ?? '')));
  if (j.notes) c.push(box('jn', j.notes, 40, 700, 1200, 150, S.note));
  return page(jid, j.title, c);
}

function build(scopeName) {
  const scope = SCOPES[scopeName];
  if (!scope) throw new Error(`unknown scope '${scopeName}'. Known: ${Object.keys(SCOPES).join(', ')}`);
  const pages = [capabilityMapPage(scope), ...scope.capabilities.map(capabilityPage), ...scope.journeys.map(journeyPage)];
  return { scope, xml: `<mxfile host="app.diagrams.net" agent="generate-flow-diagram.mjs" version="24.0.0" type="device">${pages.join('')}</mxfile>`, pageCount: pages.length };
}

// ===========================================================================
// REGISTER DRIFT CHECK
//
// WHY THIS EXISTS: the sync rule "regenerate whenever a tagged finding changes status"
// depends on someone remembering at commit time — the same memory dependency that let
// F-097 sit stale on the diagram for a whole commit before anyone inspected the raw file.
// This makes it mechanical: the register is the source of truth for finding status, and
// any disagreement with the diagram data is a hard failure.
// ===========================================================================

/** Parse the register into id -> section ('Open' | 'Resolved' | 'Backlog'). */
function readRegister(path) {
  const text = readFileSync(path, 'utf8');
  const byId = new Map();
  const rows = new Map();
  let section = null;
  for (const line of text.split(/\r?\n/)) {
    const h = /^##\s+(\S+)/.exec(line);
    if (h) section = h[1];
    const m = /^\|\s*\*{0,2}(F-\d+)\*{0,2}\s*\|/.exec(line);
    if (m) { byId.set(m[1], section); rows.set(m[1], line); }
  }
  if (byId.size === 0) throw new Error(`no finding rows parsed from ${path} — wrong file?`);
  return { byId, rows };
}

/** A finding tag on a node is either "F-0xx" or "F-0xx (fixed)". Non-F tags are labels. */
const parseTag = (tag) => {
  const m = /^(F-\d+)(\s*\(fixed\))?$/.exec(tag.trim());
  return m ? { id: m[1], claimsFixed: Boolean(m[2]) } : null;
};

function verifyRegister(scopeName, registerPath) {
  const scope = SCOPES[scopeName];
  if (!scope) throw new Error(`unknown scope '${scopeName}'`);
  const { byId, rows } = readRegister(registerPath);

  // Only the flows this scope actually draws.
  const drawn = new Set();
  for (const capId of scope.capabilities) {
    const cap = CAPABILITIES[capId];
    (cap.layout === 'groups' ? cap.groups.flatMap((g) => g.flows) : cap.flows).forEach((f) => drawn.add(f));
  }
  for (const jid of scope.journeys) JOURNEYS[jid].nodes.forEach(([f]) => drawn.add(f));

  const results = [];
  for (const fid of [...drawn].sort()) {
    for (const tag of FLOWS[fid].findings ?? []) {
      const p = parseTag(tag);
      if (!p) continue; // e.g. "(test-only)" — a label, not a finding reference
      const section = byId.get(p.id);
      let ok = true, note = '';
      if (!section) {
        ok = false; note = 'referenced on the diagram but absent from the register';
      } else if (section === 'Resolved' && !p.claimsFixed) {
        ok = false; note = 'Resolved in the register, still shown as open on the diagram — regenerate';
      } else if (section !== 'Resolved' && p.claimsFixed) {
        ok = false; note = `diagram claims "(fixed)" but the register has it under ${section}`;
      } else {
        note = `${section}${p.claimsFixed ? ' / shown fixed' : ''}`;
      }
      results.push({ fid, tag, ok, note });
    }
  }

  // Advisory only: a register entry naming an endpoint this scope draws, whose id is not
  // on that node. Heuristic, so it never fails the run — short paths are too generic to
  // match reliably, and the register indexes by endpoint and file, not by FLOW id.
  const advisories = [];
  for (const fid of drawn) {
    const path = (FLOWS[fid].endpoint.match(/\/\S+/) ?? [''])[0];
    if (path.length < 14) continue;
    // WHY a trailing boundary rather than a substring test: "/resource-pools" is a prefix of
    // "/resource-pools/:id/availability-windows", so a plain includes() reported every
    // availability finding against FLOW-019. The path must end where it ends — the next
    // character may not continue the route.
    const boundary = new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w/:-])');
    const listed = new Set((FLOWS[fid].findings ?? []).map((t) => parseTag(t)?.id).filter(Boolean));
    for (const [id, line] of rows) {
      if (byId.get(id) !== 'Open') continue;
      if (boundary.test(line) && !listed.has(id)) advisories.push({ fid, id, path });
    }
  }

  console.log(`\nDiagram/register drift check — scope ${scopeName}`);
  console.log(`Register: ${registerPath}   flows drawn: ${drawn.size}   tags checked: ${results.length}\n`);
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.fid.padEnd(10)} ${r.tag.padEnd(16)} ${r.note}`);
  }

  if (advisories.length) {
    console.log('\n  Advisory — open findings naming a drawn endpoint but not shown on its node:');
    for (const a of advisories) console.log(`    ${a.id}  mentions ${a.path}  -> consider adding to ${a.fid}`);
    console.log('    (heuristic, does not fail the check)');
  }

  const failed = results.filter((r) => !r.ok);
  console.log('');
  if (failed.length === 0) {
    console.log(`  All ${results.length} finding tags agree with the register.\n`);
    return 0;
  }
  // Naming the specific tags is the point — a generic failure would not distinguish
  // "one finding was resolved" from "the diagram was built against a different register".
  console.log(`  ${failed.length}/${results.length} tags disagree with the register: ${failed.map((f) => `${f.fid}:${f.tag}`).join(', ')}`);
  console.log('  Update the FLOWS data in this script, then run: pnpm diagram:flows\n');
  return 1;
}

// --- CLI ------------------------------------------------------------------
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };

if (argv.includes('--list')) {
  console.log('scopes:');
  for (const [k, v] of Object.entries(SCOPES)) console.log(`  ${k}  -> ${v.out}  (${v.capabilities.length} caps, ${v.journeys.length} journeys)`);
  console.log(`capabilities: ${Object.keys(CAPABILITIES).join(', ')}`);
  console.log(`flows: ${Object.keys(FLOWS).length}`);
  exit(0);
}

const scopeName = arg('--scope', 'v1-demo');

if (argv.includes('--verify-register')) {
  try {
    const reg = arg('--register', resolve(REPO_ROOT, 'docs/findings_register.md'));
    process.exitCode = verifyRegister(scopeName, reg);
  } catch (e) {
    console.error(`generate-flow-diagram --verify-register: ${e.message}`);
    process.exitCode = 2;
  }
} else {
try {
  const { scope, xml, pageCount } = build(scopeName);
  const out = arg('--out', scope.out);
  if (argv.includes('--check')) {
    console.log(`OK  scope=${scopeName}  pages=${pageCount}  bytes=${xml.length}  (--check, nothing written)`);
    exit(0);
  }
  writeFileSync(out, xml, 'utf8');
  console.log(`wrote ${out}  (${xml.length.toLocaleString()} bytes, ${pageCount} pages, scope=${scopeName})`);
} catch (e) {
  console.error(`generate-flow-diagram: ${e.message}`);
  process.exitCode = 1;
}
}
