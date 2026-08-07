import { spawn, ChildProcess } from 'child_process';

/**
 * Fixed service ports, as hardcoded across every service today.
 * WHY they are centralised here: because they are fixed (not randomised), no two
 * regression suites can run in parallel — the root orchestrator relies on this fact.
 */
export const SERVICE_PORTS = {
  slotEngine: 3001,
  identityAuth: 3002,
  tenantManagement: 3003,
  payment: 3004,
  notification: 3005,
} as const;

export const SERVICE_URLS = {
  slotEngine: `http://localhost:${SERVICE_PORTS.slotEngine}`,
  identityAuth: `http://localhost:${SERVICE_PORTS.identityAuth}`,
  tenantManagement: `http://localhost:${SERVICE_PORTS.tenantManagement}`,
  payment: `http://localhost:${SERVICE_PORTS.payment}`,
  notification: `http://localhost:${SERVICE_PORTS.notification}`,
} as const;

/**
 * Polls a service's /health route until it responds.
 * WHY: the child process starts asynchronously, so requests fired immediately
 * after spawn would race the server's listen() call.
 */
export async function waitForServer(url: string, retries = 15): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // Connection refused while still booting — retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

export interface SpawnedService {
  name: string;
  url: string;
  process: ChildProcess;
}

export interface SpawnServiceOptions {
  /** Human-readable name, used in harness log lines only. */
  name: string;
  /** Absolute path to the service's compiled dist/index.js. */
  entry: string;
  port: number;
  /** Extra env vars merged over process.env (e.g. INTERNAL_SERVICE_KEY). */
  env?: Record<string, string>;
}

/**
 * Spawns one compiled service as a child process. Mirrors the pattern every
 * pre-consolidation test file used: `node <dist/index.js>` with an explicit PORT.
 */
export function spawnService(options: SpawnServiceOptions): SpawnedService {
  const child = spawn('node', [options.entry], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(options.port), ...(options.env ?? {}) },
  });
  return {
    name: options.name,
    url: `http://localhost:${options.port}`,
    process: child,
  };
}

/**
 * Spawns every requested service and waits for all of them to report healthy.
 * Throws (after killing everything it started) if any service fails to come up,
 * so a boot failure surfaces as a clear error rather than a wall of fetch timeouts.
 */
export async function startServices(specs: SpawnServiceOptions[]): Promise<SpawnedService[]> {
  const started: SpawnedService[] = specs.map(spawnService);
  try {
    for (const service of started) {
      const healthy = await waitForServer(service.url);
      if (!healthy) {
        throw new Error(`Service "${service.name}" did not become healthy at ${service.url}`);
      }
    }
  } catch (err) {
    stopServices(started);
    throw err;
  }
  return started;
}

export function stopServices(services: SpawnedService[]): void {
  for (const service of services) {
    service.process.kill();
  }
}
