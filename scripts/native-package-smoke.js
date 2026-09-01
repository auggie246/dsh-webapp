#!/usr/bin/env node
"use strict";

const { execFileSync, spawn } = require("node:child_process");
const { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const options = parseArgs(process.argv.slice(2));
const releaseDir = path.resolve(options.release ?? "release");
const hostVersion = options.hostVersion;
if (!hostVersion) fail("--host-version is required");

const work = mkdtempSync(path.join(tmpdir(), "dsh-desktop-native-smoke-"));
const cleanups = [];

main().finally(async () => {
  for (const cleanup of cleanups.reverse()) {
    try { await cleanup(); } catch (error) { console.warn(`cleanup failed: ${messageOf(error)}`); }
  }
  rmSync(work, { recursive: true, force: true });
}).catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

async function main() {
  const dsh = installTestHost(hostVersion);
  const artifacts = discoverArtifacts(releaseDir, options.target);
  if (artifacts.length === 0) fail(`no supported packages found in ${releaseDir}`);
  for (const artifact of artifacts) {
    console.log(`\nSmoke testing ${path.basename(artifact)}`);
    const app = preparePackage(artifact);
    await runScenario(app, dsh, "spawn");
    await runScenario(app, dsh, "attach");
  }
}

function parseArgs(args) {
  const out = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (key === "--release") out.release = value;
    else if (key === "--host-version") out.hostVersion = value;
    else if (key === "--target") out.target = value;
    else fail(`unknown argument: ${key}`);
    index += 1;
  }
  return out;
}

function discoverArtifacts(directory, requestedTarget) {
  const targetExtensions = {
    dmg: ".dmg", nsis: ".exe", zip: ".zip", appimage: ".appimage", deb: ".deb",
  };
  const platformTargets = process.platform === "darwin" ? ["dmg"] : process.platform === "win32" ? ["nsis", "zip"] : ["appimage", "deb"];
  const targets = requestedTarget ? [requestedTarget.toLowerCase()] : platformTargets;
  for (const target of targets) if (!targetExtensions[target]) fail(`unsupported --target: ${target}`);
  return readdirSync(directory)
    .map((name) => path.join(directory, name))
    .filter((file) => targets.some((target) => file.toLowerCase().endsWith(targetExtensions[target])))
    .sort();
}

function installTestHost(version) {
  const prefix = path.join(work, "installed-test-dsh");
  mkdirSync(prefix, { recursive: true });
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const install = spawnCommand(npm, ["install", "--no-audit", "--no-fund", "--prefix", prefix, `@deepseek-ai/dsh@${version}`]);
  const nodeOptions = [process.env.NODE_OPTIONS, "--max-old-space-size=4096"].filter(Boolean).join(" ");
  execFileSync(install.command, install.args, {
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
    stdio: "inherit",
    windowsHide: true,
  });
  const executable = path.join(prefix, "node_modules", ".bin", process.platform === "win32" ? "dsh.cmd" : "dsh");
  if (!existsSync(executable)) fail(`installed dsh launcher is missing: ${executable}`);
  const versionCommand = spawnCommand(executable, ["--version"]);
  const installedVersion = execFileSync(versionCommand.command, versionCommand.args, {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  if (installedVersion !== version) fail(`installed dsh reports ${installedVersion}, expected ${version}`);
  return executable;
}

function preparePackage(artifact) {
  const lower = artifact.toLowerCase();
  if (lower.endsWith(".dmg")) return prepareDmg(artifact);
  if (lower.endsWith(".exe")) return prepareNsis(artifact);
  if (lower.endsWith(".zip")) return prepareZip(artifact);
  if (lower.endsWith(".appimage")) {
    chmodSync(artifact, 0o755);
    return { command: "xvfb-run", args: ["-a", artifact], env: { APPIMAGE_EXTRACT_AND_RUN: "1" }, label: "AppImage" };
  }
  if (lower.endsWith(".deb")) return prepareDeb(artifact);
  fail(`unsupported package: ${artifact}`);
}

function prepareDmg(artifact) {
  const mount = path.join(work, `dmg-${Date.now()}`);
  mkdirSync(mount);
  execFileSync("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, artifact], { stdio: "inherit" });
  cleanups.push(() => execFileSync("hdiutil", ["detach", mount], { stdio: "inherit" }));
  const app = readdirSync(mount).find((name) => name.endsWith(".app"));
  if (!app) fail(`DMG contains no application: ${artifact}`);
  return { command: path.join(mount, app, "Contents", "MacOS", "dsh-desktop"), args: [], env: {}, label: "DMG" };
}

function prepareNsis(artifact) {
  const install = path.join(work, `nsis-${Date.now()}`);
  mkdirSync(install);
  execFileSync(artifact, ["/S", `/D=${install}`], { stdio: "inherit", windowsHide: true });
  const executable = findNamedFile(install, "dsh-desktop.exe");
  if (!executable) fail(`NSIS did not install dsh-desktop.exe into ${install}`);
  return { command: executable, args: [], env: {}, label: "NSIS" };
}

function prepareZip(artifact) {
  const unpack = path.join(work, `zip-${Date.now()}`);
  mkdirSync(unpack);
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", artifact, unpack], { stdio: "inherit", windowsHide: true });
  const executable = findNamedFile(unpack, "dsh-desktop.exe");
  if (!executable) fail(`ZIP contains no dsh-desktop.exe: ${artifact}`);
  return { command: executable, args: [], env: {}, label: "ZIP" };
}

function prepareDeb(artifact) {
  execFileSync("sudo", ["apt-get", "install", "-y", artifact], { stdio: "inherit" });
  cleanups.push(() => execFileSync("sudo", ["apt-get", "remove", "-y", "dsh-desktop"], { stdio: "inherit" }));
  return { command: "xvfb-run", args: ["-a", "/usr/bin/dsh-desktop"], env: {}, label: "DEB" };
}

async function runScenario(app, dsh, kind) {
  const scenario = path.join(work, `${app.label.toLowerCase()}-${kind}-${Date.now()}`);
  const userData = path.join(scenario, "user-data");
  const events = path.join(scenario, "events.jsonl");
  mkdirSync(userData, { recursive: true });
  let attached;
  let port = 0;
  if (kind === "attach") {
    attached = await startDsh(dsh);
    port = attached.port;
  }
  writeFileSync(path.join(userData, "host-bar.json"), JSON.stringify([{ id: `smoke-${kind}`, kind, port, label: "Host 1" }]));
  const env = {
    ...process.env,
    ...app.env,
    DSH_DESKTOP_SMOKE_FILE: events,
    DSH_DESKTOP_SMOKE_USER_DATA: userData,
    DSH_DESKTOP_SMOKE_AUTO_QUIT: "1",
  };
  if (kind === "spawn") env.DSH_BIN = dsh;
  else delete env.DSH_BIN;
  try {
    await runProcess(app.command, app.args, env, 120_000);
    execFileSync(process.execPath, [path.join(root, "scripts", "assert-smoke-events.js"), events, kind], { stdio: "inherit" });
    const parsed = readSmokeEvents(events);
    const ready = parsed.find((event) => event.event === "host-ready");
    if (!ready?.port) fail(`${app.label} ${kind} did not record a Host port`);
    if (kind === "spawn") {
      await waitForPortState(ready.port, false, 15_000);
      if (ready.pid) await waitForPidExit(ready.pid, 15_000);
    } else {
      await waitForDescribe(ready.port, 5_000);
      await waitForPortState(ready.port, true, 5_000);
    }
    console.log(`✓ ${app.label} ${kind}`);
  } finally {
    if (attached) await stopProcessTree(attached.child);
  }
}

function startDsh(executable) {
  return new Promise((resolve, reject) => {
    const command = spawnCommand(executable, ["web", "--no-open", "--port", "0"]);
    const child = spawn(command.command, command.args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    const timer = setTimeout(() => { void stopProcessTree(child); reject(new Error("test Host did not print its URL")); }, 30_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /dsh web:\s+http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]) });
      }
    });
    child.stderr.pipe(process.stderr);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`test Host exited early (${code})`)); });
  });
}

function spawnCommand(executable, args) {
  if (process.platform === "win32" && executable.toLowerCase().endsWith(".cmd")) {
    return { command: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", "call", executable, ...args] };
  }
  return { command: executable, args };
}

function runProcess(command, args, env, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => { void stopProcessTree(child); reject(new Error(`${command} timed out`)); }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code=${code} signal=${signal}`));
    });
  });
}

function readSmokeEvents(file) {
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function waitForDescribe(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${port}/api/host.describe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: "native-smoke", method: "host.describe", payload: {} }),
      signal: AbortSignal.timeout(1_000),
    }).then(async (result) => result.ok ? result.json() : null, () => null);
    if (response?.type === "server-response" && response?.result?.ok === true) return response;
    await delay(250);
  }
  fail(`Host port ${port} did not answer host.describe`);
}

async function waitForPortState(port, expectedUp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const up = await fetch(`http://127.0.0.1:${port}/api/host.describe`, { method: "POST", signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
    if (up === expectedUp) return;
    await delay(250);
  }
  fail(`Host port ${port} did not become ${expectedUp ? "available" : "unavailable"}`);
}

async function waitForPidExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return; }
    await delay(250);
  }
  fail(`Spawned Host PID ${pid} is still alive`);
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  if (process.platform === "win32" && child.pid) {
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch {}
  } else {
    try { child.kill("SIGKILL"); } catch {}
  }
  if (child.exitCode === null && child.signalCode === null) await closed;
}

function findNamedFile(directory, name) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findNamedFile(file, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) return file;
  }
  return null;
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
function fail(message) { throw new Error(message); }
