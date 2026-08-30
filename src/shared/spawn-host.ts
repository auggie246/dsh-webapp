// The Spawn half of attach-or-spawn (issue #1): start a Host as a child,
// read its stdout until the `dsh web:` contract line, and never orphan the
// child — it is handed to the caller the moment it exists (prototype issue
// #4 finding: a quit during the URL wait must still see it), and a timeout
// kills it.
import { spawn, type ChildProcess } from "node:child_process";
import { LineAssembler } from "./lines.js";
import { parseDshWebLine } from "./url-line.js";

export interface SpawnedHost {
  child: ChildProcess;
  url: string;
  port: number;
}

export interface HostSpawnCommand {
  command: string;
  args: string[];
  windowsHide: boolean;
}

export function spawnHostCommand(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform
): HostSpawnCommand {
  if (platform === "win32" && /\.cmd$/i.test(command)) {
    const escaped = [`"${command.replace(/"/g, '\\"')}"`, ...args.map(quoteCmdArgument)].join(" ");
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", escaped],
      windowsHide: true,
    };
  }
  return { command, args, windowsHide: true };
}

function quoteCmdArgument(argument: string): string {
  return /[\s&|<>^]/.test(argument) ? `"${argument.replace(/"/g, '\\"')}"` : argument;
}

export interface SpawnHostOptions {
  /** Fail after this long without a URL line. Default 30 000 ms. */
  timeoutMs?: number;
  /** Child environment. Augment PATH with the bin dir before calling. */
  env?: NodeJS.ProcessEnv;
  /** Called synchronously with the child as soon as it exists. */
  onChild?: (child: ChildProcess) => void;
}

export function spawnHostUntilUrl(
  command: string,
  args: string[],
  options: SpawnHostOptions = {}
): Promise<SpawnedHost> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  return new Promise<SpawnedHost>((resolve, reject) => {
    const spawnCommand = spawnHostCommand(command, args);
    const child = spawn(spawnCommand.command, spawnCommand.args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env,
      windowsHide: spawnCommand.windowsHide,
    });
    options.onChild?.(child);

    let settled = false;
    let stderrTail: string[] = [];
    const assembler = new LineAssembler();

    const settle = (host: SpawnedHost) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(host);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(message));
    };

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      for (const line of assembler.push(chunk)) {
        const parsed = parseDshWebLine(line);
        if (parsed) {
          settle({ child, url: parsed.url, port: parsed.port });
          return;
        }
      }
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      const lines = chunk.split("\n").filter((line) => line.trim() !== "");
      stderrTail = [...stderrTail, ...lines].slice(-5);
    });

    child.on("error", (error) => fail(`spawn failed: ${error.message}`));

    child.on("exit", (code, signal) => {
      const tail = stderrTail.length > 0 ? `; stderr: ${stderrTail.join(" | ")}` : "";
      fail(
        `Host exited before printing its URL line (code=${code} signal=${signal})${tail}`
      );
    });

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
      fail(`no URL line within ${timeoutMs}ms`);
    }, timeoutMs);
  });
}
