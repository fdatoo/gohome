import fs from "node:fs";
import path from "node:path";

const statePath = path.resolve(import.meta.dirname, "../.playwright-daemon.json");

type State = {
  pid: number;
  workDir: string;
};

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(statePath)) return;
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as State;
  try {
    process.kill(state.pid, "SIGTERM");
  } catch {
    // Process already exited.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    process.kill(state.pid, 0);
    process.kill(state.pid, "SIGKILL");
  } catch {
    // Process exited after SIGTERM.
  }
  fs.rmSync(state.workDir, { recursive: true, force: true });
  fs.rmSync(statePath, { force: true });
}
