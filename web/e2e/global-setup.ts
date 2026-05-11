import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";

const passwordHash = "$argon2id$v=19$m=64,t=1,p=1$dxLs8ar4jK98HpNH21oq7Q$P2u+gVsULLKHoY2Z/pScH5xfhKslCWwJHuLeJpA0CoM";
const statePath = path.resolve(import.meta.dirname, "../.playwright-daemon.json");

async function waitForHealth(baseURL: string, proc: ReturnType<typeof spawn>, logPath: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      const logs = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
      throw new Error(`switchyardd exited before health check passed\n${logs}`);
    }
    try {
      const response = await fetch(new URL("/healthz", baseURL));
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const logs = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  throw new Error(`switchyardd did not become healthy\n${logs}`);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      server.close(() => {
        if (addr && typeof addr === "object") resolve(addr.port);
        else reject(new Error("failed to allocate port"));
      });
    });
    server.on("error", reject);
  });
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function writeConfig(configDir: string, baseURL: string): void {
  const url = new URL(baseURL);
  const host = url.hostname || "127.0.0.1";
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  fs.writeFileSync(path.join(configDir, "main.pkl"), `
amends "switchyard:config"

import "switchyard:auth" as auth
import "switchyard:dashboards" as dash
import "switchyard:policy" as policy
import "switchyard:widgets" as widgetmod

local adminRole = new auth.Role {
  slug = "admin"
  display_name = "Admin"
}

roles = new {
  adminRole
}

users = new {
  new auth.User {
    slug = "admin"
    display_name = "Admin"
    roles = List(adminRole)
    bootstrap_password_hash = "${passwordHash}"
  }
}

policies = new {
  new policy.Policy {
    name = "admin"
    subjects = List(adminRole)
    allow = List(
      new policy.CapabilityRule {
        verbs = List("read", "call", "write", "admin")
        targets = policy.AnyEntity
        services = List("*")
      },
    )
  }
}

dashboards = new {
  new dash.Dashboard {
    slug = "default"
    title = "Default"
    widgets = new {
      new dash.LeafWidget {
        id = "demo_toggle"
        widgetClass = widgetmod.entityToggle
        pos = new widgetmod.Position {
          x = 0
          y = 0
          width = 4
          height = 2
        }
      }
    }
  }
}

auth_settings = new auth.AuthSettings {
  rp_id = "${host}"
  rp_origins = List("${url.origin}")
}

listener {
  tcp {
    bind = "${host}:${port}"
  }
}
`);
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.PLAYWRIGHT_SKIP_DAEMON === "1") return;

  const webRoot = path.resolve(import.meta.dirname, "..");
  const repoRoot = path.resolve(webRoot, "..");
  const baseURL = config.projects[0]?.use.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${await freePort()}`;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "switchyard-e2e-"));
  const dataDir = path.join(workDir, "data");
  const configDir = path.join(workDir, "config");
  const driversDir = path.join(workDir, "drivers");
  const binPath = path.join(workDir, "switchyardd");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(driversDir, { recursive: true });
  writeConfig(configDir, baseURL);

  run("npm", ["run", "build"], webRoot);
  run("go", ["build", "-o", binPath, "./cmd/switchyardd"], repoRoot);

  const logPath = path.join(workDir, "switchyardd.log");
  const log = fs.openSync(logPath, "w");
  const proc = spawn(binPath, [
    "--data-dir", dataDir,
    "--config-dir", configDir,
    "--drivers-dir", driversDir,
    "--admin-port", "0",
    "--log-format", "json",
    "--log-level", "debug",
  ], {
    cwd: repoRoot,
    stdio: ["ignore", log, log],
  });

  fs.writeFileSync(statePath, JSON.stringify({ pid: proc.pid, workDir, logPath }, null, 2));
  await waitForHealth(baseURL, proc, logPath);
}
