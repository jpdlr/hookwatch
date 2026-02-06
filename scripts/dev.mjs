import { spawn } from "node:child_process";

const processes = [];

const run = (label, command, args) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
  });
  processes.push(child);

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
      for (const proc of processes) {
        if (proc.pid && !proc.killed) {
          proc.kill();
        }
      }
      process.exit(code);
    }
  });
};

run("server", "npm", ["run", "dev:server"]);
run("web", "npm", ["run", "dev:web"]);
