import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runAppleScript(lines, args = []) {
  const scriptArgs = lines.flatMap((line) => ["-e", line]);
  const { stdout } = await execFileAsync("osascript", ["-l", "AppleScript", ...scriptArgs, ...args], {
    maxBuffer: 1024 * 1024,
  });

  return stdout.trim();
}

export async function openApplicationUrl(applicationName, url) {
  await execFileAsync("open", ["-a", applicationName, url], {
    maxBuffer: 1024 * 1024,
  });
}

export async function launchApplicationBinary(applicationName, args = []) {
  await execFileAsync(`/Applications/${applicationName}.app/Contents/MacOS/${applicationName}`, args, {
    maxBuffer: 1024 * 1024,
  });
}
