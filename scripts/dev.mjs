import { spawn } from "node:child_process";
import readline from "node:readline";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const processes = [
  { label: "api", args: ["run", "dev:api"] },
  { label: "ui", args: ["run", "dev:ui"] },
];

let shuttingDown = false;
const children = processes.map(({ label, args }) => {
  const child = spawn(npmCommand, args, {
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  prefixOutput(child.stdout, label);
  prefixOutput(child.stderr, label);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    stopChildren();
    process.exit(code ?? (signal ? 1 : 0));
  });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.error(`[${label}] ${error.message}`);
    stopChildren();
    process.exit(1);
  });

  return child;
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function prefixOutput(stream, label) {
  const lines = readline.createInterface({ input: stream });

  lines.on("line", (line) => {
    console.log(`[${label}] ${line}`);
  });
}

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopChildren();
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}
