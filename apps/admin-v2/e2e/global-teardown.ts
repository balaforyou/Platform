import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '../../../packages/database/dist/index.js';
import { TEST_TENANT_SUBDOMAIN } from './global-setup';

const PID_FILE = resolve(process.cwd(), 'e2e/.pids.json');

export default async function globalTeardown() {
  if (existsSync(PID_FILE)) {
    const { tm, ia } = JSON.parse(readFileSync(PID_FILE, 'utf8'));
    for (const pid of [tm, ia]) {
      try {
        if (pid) process.kill(pid);
      } catch {
        /* already gone */
      }
    }
    unlinkSync(PID_FILE);
  }

  const prisma = new PrismaClient();
  const t = await prisma.tenant.findFirst({ where: { subdomain: TEST_TENANT_SUBDOMAIN } });
  if (t) {
    await prisma.webAuthnCredential.deleteMany({ where: { user: { tenantId: t.id } } });
    await prisma.authSession.deleteMany({ where: { user: { tenantId: t.id } } });
    await prisma.roleAssignment.deleteMany({ where: { tenantId: t.id } });
    await prisma.user.deleteMany({ where: { tenantId: t.id } });
    await prisma.branch.deleteMany({ where: { tenantId: t.id } });
    await prisma.tenant.delete({ where: { id: t.id } });
  }
  await prisma.$disconnect();
}
