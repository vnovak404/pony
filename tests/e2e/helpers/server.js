import { spawn } from "node:child_process";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return true;
    } catch (error) {
      // ignore
    }
    await delay(250);
  }
  throw new Error(`Server did not become healthy at ${url}`);
}

export async function startServer() {
  const port = await findFreePort();
  const proc = spawn(
    ".venv/bin/python",
    ["scripts/pony_server.py", "--host", "127.0.0.1", "--port", String(port)],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    }
  );

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const baseURL = `http://127.0.0.1:${port}`;
  await waitForHealth(`${baseURL}/api/health`);

  return {
    baseURL,
    stop: async () => {
      if (proc.killed) return;
      proc.kill("SIGINT");
      await Promise.race([
        new Promise((resolve) => proc.once("exit", resolve)),
        delay(2000),
      ]);
      if (!proc.killed) proc.kill("SIGKILL");
      if (stderr) {
        // eslint-disable-next-line no-console
        console.warn(stderr);
      }
    },
  };
}
