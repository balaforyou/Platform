import { test, expect } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import http, { type IncomingMessage, type ServerResponse } from 'http';
import path from 'path';
import { PrismaClient } from '@badminton/database';

function loadRootEnv() {
  const envPath = path.resolve(process.cwd(), '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

loadRootEnv();

const prisma = new PrismaClient();
const tenantSubdomain = 'courtowner1';
const branchId = 'f043c-branch';
const poolId = 'f043c-pool';
const ownerId = 'f043c-owner';
const guestId = 'f043c-guest';
const ownerPhone = '+919944444444';
const guestPhone = '+919855555555';
const proxyPort = 8080;
const guestWebPort = 6173;
const adminWebPort = 6174;

function responseItems<T = any>(body: T[] | { data?: T[] }) {
  return Array.isArray(body) ? body : body.data || [];
}

function dateOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

async function waitFor(url: string, label: string, retries = 60) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Wait for process startup.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

function spawnProcess(command: string, args: string[], cwd: string) {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: command.endsWith('.cmd'),
    env: { ...process.env, VITE_DEFAULT_TENANT_SUBDOMAIN: tenantSubdomain },
  });
  child.stdout?.on('data', (data) => process.stdout.write(data));
  child.stderr?.on('data', (data) => process.stderr.write(data));
  return child;
}

function proxyRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '/';
  let target = `http://127.0.0.1:${guestWebPort}`;
  let path = url;

  if (url === '/admin') {
    target = `http://127.0.0.1:${adminWebPort}`;
    path = '/admin/';
  } else if (url.startsWith('/admin')) {
    target = `http://127.0.0.1:${adminWebPort}`;
  } else if (url.startsWith('/api/slot-engine')) {
    target = 'http://127.0.0.1:3001';
    path = url.replace(/^\/api\/slot-engine/, '') || '/';
  } else if (url.startsWith('/api/identity')) {
    target = 'http://127.0.0.1:3002';
    path = url.replace(/^\/api\/identity/, '') || '/';
  } else if (url.startsWith('/api/tenant')) {
    target = 'http://127.0.0.1:3003';
    path = url.replace(/^\/api\/tenant/, '') || '/';
  } else if (url.startsWith('/api/payment')) {
    target = 'http://127.0.0.1:3004';
    path = url.replace(/^\/api\/payment/, '') || '/';
  }

  const targetUrl = new URL(path, target);
  const proxy = http.request(targetUrl, {
    method: req.method,
    headers: { ...req.headers, host: targetUrl.host },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(String(error));
  });
  req.pipe(proxy);
}

async function seedF043() {
  const tenant = await prisma.tenant.findUnique({ where: { subdomain: tenantSubdomain } });
  const tenantId = tenant?.id || 'f043c-tenant';
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: { name: 'Elite Resource Rentals', subdomain: tenantSubdomain, appName: 'Elite Resources', themeColor: '#0f766e', plan: 'basic', status: 'active' },
    create: { id: tenantId, name: 'Elite Resource Rentals', subdomain: tenantSubdomain, appName: 'Elite Resources', themeColor: '#0f766e', plan: 'basic', status: 'active' },
  });

  await prisma.bookingPlayer.deleteMany({ where: { booking: { resourcePoolId: poolId } } });
  await prisma.booking.deleteMany({ where: { resourcePoolId: poolId } });
  await prisma.availabilityWindow.deleteMany({ where: { resourcePoolId: poolId } });
  await prisma.availabilityOverride.deleteMany({ where: { resourcePoolId: poolId } });
  await prisma.availabilityPattern.deleteMany({ where: { resourcePoolId: poolId } });
  await prisma.generationLock.deleteMany({ where: { resourcePoolId: poolId } });
  await prisma.bookingRule.deleteMany({ where: { resourcePoolId: poolId } });
  await prisma.resourcePool.deleteMany({ where: { id: poolId } });
  await prisma.roleAssignment.deleteMany({ where: { userId: ownerId, tenantId } });
  await prisma.authSession.deleteMany({ where: { userId: { in: [ownerId, guestId] } } });
  await prisma.otpRequest.deleteMany({ where: { phone: { in: [ownerPhone, guestPhone] } } });
  await prisma.user.deleteMany({ where: { OR: [{ id: { in: [ownerId, guestId] } }, { tenantId, phone: { in: [ownerPhone, guestPhone] } }] } });
  await prisma.branch.deleteMany({ where: { id: branchId } });

  await prisma.branch.create({
    data: {
      id: branchId,
      tenantId,
      name: 'F043 Resource Hub',
      status: 'ACTIVE',
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      workingHoursStart: '06:00',
      workingHoursEnd: '23:00',
    },
  });
  await prisma.user.create({ data: { id: ownerId, tenantId, phone: ownerPhone, isPhoneVerified: true, userType: 'MEMBER' } });
  await prisma.user.create({ data: { id: guestId, tenantId, phone: guestPhone, isPhoneVerified: true, userType: 'GUEST' } });
  await prisma.roleAssignment.create({ data: { id: 'f043c-owner-role', userId: ownerId, tenantId, branchId, role: 'OWNER' } });
  await prisma.resourcePool.create({
    data: {
      id: poolId,
      tenantId,
      branchId,
      name: 'F043 Resource Pool',
      allocationMode: 'POOLED',
      capacity: 8,
      minOccupancy: 1,
      minBookingDurationMinutes: 30,
      pricingMode: 'FLAT',
      defaultRate: 210,
      basePrice: 210,
    },
  });
  await prisma.bookingRule.create({
    data: {
      resourcePoolId: poolId,
      memberWindowDays: 30,
      guestOpenWindowDays: 14,
      gracePeriodMinutes: 30,
      guestAccessCutoffMinutes: 120,
      lowOccupancyThresholdPct: 50,
      prepaymentRequired: true,
      cancellationPolicyJson: { type: 'tiered', tiers: [{ min_hours_before_slot: 0, refund_percent: 0 }] },
    },
  });

  return {
    tenantId,
    previewDate: dateOffset(1),
    closedDate: dateOffset(2),
    guestDate: dateOffset(3),
    modifiedDate: dateOffset(4),
  };
}

async function loginByOtp(page: any, phone: string, appPrefix = '') {
  await page.goto(`${appPrefix}/login?tenant=${tenantSubdomain}`);
  await page.locator('input[placeholder="99999 99999"], input[placeholder="9999999999"]').fill(phone.replace('+91', ''));
  await page.click('button[type="submit"]');
  const otpInput = page.locator('input[placeholder="Enter 4 or 6 digit OTP"], input[placeholder="123456"]');
  await otpInput.waitFor();
  await otpInput.fill('123456');
  await page.click('button[type="submit"]');
}

test.describe('F-043 Phase C scheduling UI', () => {
  test.setTimeout(240000);
  let processes: ChildProcess[] = [];
  let proxyServer: http.Server;

  test.beforeAll(async () => {
    await seedF043();
    const root = process.cwd().replace(/\\apps\\guest-member-pwa$/, '');
    processes = [
      spawnProcess(process.execPath, ['--import', 'tsx', 'src/index.ts'], `${root}\\services\\slot-engine`),
      spawnProcess(process.execPath, ['--import', 'tsx', 'src/index.ts'], `${root}\\services\\identity-auth`),
      spawnProcess(process.execPath, ['--import', 'tsx', 'src/index.ts'], `${root}\\services\\tenant-management`),
      spawnProcess('pnpm.cmd', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(adminWebPort), '--strictPort'], `${root}\\apps\\admin-web`),
      spawnProcess('pnpm.cmd', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(guestWebPort), '--strictPort'], `${root}\\apps\\guest-member-pwa`),
    ];
    proxyServer = http.createServer(proxyRequest);
    await new Promise<void>((resolve) => proxyServer.listen(proxyPort, resolve));

    await waitFor('http://127.0.0.1:3001/health', 'Slot Engine');
    await waitFor('http://127.0.0.1:3002/health', 'Identity');
    await waitFor('http://127.0.0.1:3003/health', 'Tenant');
    await waitFor(`http://127.0.0.1:${adminWebPort}/admin/`, 'Admin Web');
    await waitFor(`http://127.0.0.1:${guestWebPort}/`, 'Guest PWA');
  });

  test.afterAll(async () => {
    for (const child of processes) {
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill();
      }
    }
    if (proxyServer) await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
    await prisma.$disconnect();
  });

  test('admin schedules recurring availability and guest books lazily generated slot', async ({ browser }) => {
    const { previewDate, closedDate, guestDate, modifiedDate } = await seedF043();
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginByOtp(adminPage, ownerPhone, '/admin');
    await expect(adminPage).toHaveURL(/\/admin\/?(\?tenant=courtowner1)?$/);
    await adminPage.goto(`/admin/scheduling?tenant=${tenantSubdomain}`);
    await adminPage.selectOption('label:has-text("Branch") select', branchId);
    await adminPage.selectOption('label:has-text("Resource pool") select', poolId);

    const patternPanel = adminPage.locator('#scheduling-pattern-panel');
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      const checkbox = patternPanel.locator(`label:has-text("${day}") input`);
      if (!(await checkbox.isChecked())) await checkbox.check();
    }
    await patternPanel.locator('label:has-text("Start time") input').fill('09:00');
    await patternPanel.locator('label:has-text("End time") input').fill('11:00');
    await patternPanel.locator('label:has-text("Slot duration") input').fill('60');
    await patternPanel.locator('label:has-text("Capacity") input').fill('4');
    await patternPanel.locator('label:has-text("Pricing mode") select').selectOption('FLAT');
    await patternPanel.locator('label:has-text("Price override") input').fill('210');
    const patternResponse = adminPage.waitForResponse((res) => res.url().includes('/api/slot-engine/resource-pools/f043c-pool/availability-patterns') && res.request().method() === 'POST');
    await patternPanel.getByRole('button', { name: /Create pattern/i }).click();
    expect((await patternResponse).status()).toBe(201);
    await expect(patternPanel.locator('.success-box')).toContainText('Pattern saved.');
    await patternPanel.screenshot({ path: 'test-results/f043-admin-pattern-form.png' });

    const beforeGuestWindows = await prisma.availabilityWindow.count({ where: { resourcePoolId: poolId, generationDate: new Date(`${guestDate}T00:00:00.000Z`) } });
    expect(beforeGuestWindows).toBe(0);
    const evidence: Record<string, any> = {
      dates: { previewDate, closedDate, guestDate, modifiedDate },
      lazyGenerationBefore: { guestDate, windowCount: beforeGuestWindows },
    };
    console.log('F043_LAZY_GENERATION_BEFORE', JSON.stringify(evidence.lazyGenerationBefore));

    const overridePanel = adminPage.locator('#scheduling-override-panel');
    await overridePanel.locator('label:has-text("From date") input').fill(closedDate);
    await overridePanel.locator('label:has-text("To date") input').fill(closedDate);
    await overridePanel.locator('label:has-text("Type") select').selectOption('CLOSED');
    await overridePanel.locator('label:has-text("Reason") input').fill('Closed for setup');
    const closedResponse = adminPage.waitForResponse((res) => res.url().includes('/api/slot-engine/resource-pools/f043c-pool/availability-overrides') && res.request().method() === 'POST');
    await overridePanel.getByRole('button', { name: /Create override/i }).click();
    expect((await closedResponse).status()).toBe(201);
    await expect(overridePanel.locator('.success-box')).toContainText('Override saved.');
    await overridePanel.screenshot({ path: 'test-results/f043-admin-override-closed.png' });

    await overridePanel.getByRole('button', { name: 'New' }).click();
    await overridePanel.locator('label:has-text("From date") input').fill(modifiedDate);
    await overridePanel.locator('label:has-text("To date") input').fill(modifiedDate);
    await overridePanel.locator('label:has-text("Type") select').selectOption('MODIFIED');
    await overridePanel.locator('label:has-text("Start time") input').fill('14:00');
    await overridePanel.locator('label:has-text("End time") input').fill('15:00');
    await overridePanel.locator('label:has-text("Slot duration") input').fill('30');
    await overridePanel.locator('label:has-text("Capacity") input').fill('5');
    await overridePanel.locator('label:has-text("Pricing mode") select').selectOption('PER_PERSON');
    await overridePanel.locator('label:has-text("Price override") input').fill('175');
    const modifiedResponse = adminPage.waitForResponse((res) => res.url().includes('/api/slot-engine/resource-pools/f043c-pool/availability-overrides') && res.request().method() === 'POST');
    await overridePanel.getByRole('button', { name: /Create override/i }).click();
    expect((await modifiedResponse).status()).toBe(201);
    await overridePanel.screenshot({ path: 'test-results/f043-admin-override-modified.png' });

    const previewPanel = adminPage.locator('#scheduling-preview-panel');
    await previewPanel.locator('label:has-text("Preview date") input').fill(previewDate);
    await expect(previewPanel.locator('.preview-row')).toHaveCount(2);
    await expect(previewPanel).toContainText('4 available of 4');
    await adminPage.screenshot({ path: 'test-results/f043-admin-preview-generated.png', fullPage: true });

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await loginByOtp(guestPage, guestPhone);
    await guestPage.goto(`/branches/${branchId}/book/${poolId}?tenant=${tenantSubdomain}`);
    const guestAvailabilityResponse = guestPage.waitForResponse((res) =>
      res.url().includes(`/api/slot-engine/resource-pools/${poolId}/availability?date=${guestDate}`)
      && res.request().method() === 'GET',
    );
    await guestPage.locator('input[type="date"]').fill(guestDate);
    const guestAvailability = await guestAvailabilityResponse;
    expect(guestAvailability.status()).toBe(200);
    const guestAvailabilityBody = await guestAvailability.json();
    const guestAvailabilitySlots = responseItems(guestAvailabilityBody);
    expect(guestAvailabilitySlots).toHaveLength(2);
    await expect(guestPage.locator('[id^="slot-card-"]')).toHaveCount(2);
    await guestPage.screenshot({ path: 'test-results/f043-guest-lazy-generated-slots.png', fullPage: true });
    const generatedGuestWindows = await prisma.availabilityWindow.findMany({
      where: { resourcePoolId: poolId, generationDate: new Date(`${guestDate}T00:00:00.000Z`) },
      orderBy: { startTime: 'asc' },
    });
    expect(generatedGuestWindows).toHaveLength(2);
    expect(generatedGuestWindows.every((window) => !!window.generatedFromPatternId)).toBe(true);
    evidence.lazyGenerationAfter = {
      guestDate,
      availabilityReturned: guestAvailabilitySlots.length,
      dbWindows: generatedGuestWindows.map((window) => ({
        id: window.id,
        generatedFromPatternId: window.generatedFromPatternId,
        generationDate: window.generationDate?.toISOString().slice(0, 10),
      })),
    };
    console.log('F043_LAZY_GENERATION_AFTER', JSON.stringify(evidence.lazyGenerationAfter));

    await guestPage.locator('[id^="slot-card-"]').first().click();
    const bookingResponse = guestPage.waitForResponse((res) => res.url().includes('/api/slot-engine/bookings') && res.request().method() === 'POST');
    await guestPage.click('#reserve-court-btn');
    const bookingRes = await bookingResponse;
    expect(bookingRes.status()).toBe(201);
    const bookingBody = await bookingRes.json();
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingBody.data.id } });
    expect(booking.userId).toBe(guestId);
    expect(booking.windowId).toBe(generatedGuestWindows[0].id);
    expect(booking.status).toBe('HELD');
    evidence.booking = {
      id: booking.id,
      status: booking.status,
      userId: booking.userId,
      windowId: booking.windowId,
    };
    await guestPage.goto(`/bookings/my?tenant=${tenantSubdomain}`);
    const bookingCard = guestPage.locator(`#booking-card-${booking.id}`);
    await expect(bookingCard).toBeVisible();
    await expect(bookingCard).toContainText('Hold Pending');
    await expect(bookingCard).toContainText('F043 Resource Pool');
    await guestPage.screenshot({ path: 'test-results/f043-guest-booking-held.png', fullPage: true });

    await guestPage.goto(`/branches/${branchId}/book/${poolId}?tenant=${tenantSubdomain}`);
    const closedAvailabilityResponse = guestPage.waitForResponse((res) =>
      res.url().includes(`/api/slot-engine/resource-pools/${poolId}/availability?date=${closedDate}`)
      && res.request().method() === 'GET',
    );
    await guestPage.locator('input[type="date"]').fill(closedDate);
    const closedAvailability = await closedAvailabilityResponse;
    expect(closedAvailability.status()).toBe(200);
    const closedAvailabilityBody = await closedAvailability.json();
    const closedAvailabilitySlots = responseItems(closedAvailabilityBody);
    expect(closedAvailabilitySlots).toHaveLength(0);
    await expect(guestPage.locator('[id^="slot-card-"]')).toHaveCount(0);
    await expect(guestPage.locator('text=No slots available on this date. Try another date.')).toBeVisible();
    evidence.closedOverrideGuest = { closedDate, availabilityReturned: closedAvailabilitySlots.length };
    console.log('F043_CLOSED_OVERRIDE_GUEST', JSON.stringify(evidence.closedOverrideGuest));
    await guestPage.screenshot({ path: 'test-results/f043-guest-closed-override-empty.png', fullPage: true });

    fs.writeFileSync('test-results/f043-phase-c-evidence.json', `${JSON.stringify(evidence, null, 2)}\n`);
    console.log('F043_PHASE_C_EVIDENCE', JSON.stringify({
      previewDate,
      closedDate,
      guestDate,
      modifiedDate,
      guestGeneratedWindowIds: generatedGuestWindows.map((window) => window.id),
      bookingId: booking.id,
      bookingStatus: booking.status,
    }));
    await adminContext.close();
    await guestContext.close();
  });
});
