import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

import { getOverview, listLeads, listRuns, withDb } from "./db.js";
import { JOBS_DIR, PUBLIC_DIR } from "./lib/paths.js";
import { prepareRerun } from "./rerunPlanner.js";
import { loadRunArtifacts } from "./runReview.js";
import { runLeadEngine } from "./runLeadEngine.js";

const DEFAULT_PORT = 4318;

function json(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function sendText(response, statusCode, value, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(value);
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() ? JSON.parse(raw) : {};
}

function staticContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function serveStatic(requestPath, response) {
  const safePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  try {
    const content = await fs.readFile(filePath);
    sendText(response, 200, content, staticContentType(filePath));
    return true;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      sendText(response, 500, "Internal Server Error");
      return true;
    }
    return false;
  }
}

export function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const pathParts = url.pathname.split("/").filter(Boolean);

      if (request.method === "GET" && url.pathname === "/api/overview") {
        const overview = withDb((db) => ({
          overview: getOverview(db),
          runs: listRuns(db, 20),
          leads: listLeads(db, { limit: 50 }),
        }), { readOnly: true, fallback: { overview: { runCount: 0, leadCount: 0, hotLeadCount: 0, readyCount: 0 }, runs: [], leads: [] } });

        return json(response, 200, {
          ...overview,
          exampleJobPath: path.join(JOBS_DIR, "example-indie-authors.json"),
        });
      }

      if (
        request.method === "GET" &&
        pathParts[0] === "api" &&
        pathParts[1] === "runs" &&
        pathParts[3] === "review"
      ) {
        const runId = pathParts[2];
        const artifacts = await loadRunArtifacts({ runId });
        return json(response, 200, {
          runId: artifacts.runId,
          runDir: artifacts.runDir,
          manifest: artifacts.manifest,
          error: artifacts.error,
          review: artifacts.review,
          invalidReplies: artifacts.invalidReplies,
          debugLog: artifacts.debugLog,
        });
      }

      if (
        request.method === "POST" &&
        pathParts[0] === "api" &&
        pathParts[1] === "runs" &&
        pathParts[3] === "prepare-rerun"
      ) {
        const runId = pathParts[2];
        const body = await readRequestJson(request);
        return json(response, 200, await prepareRerun({
          runId,
          outputJobPath: body.outputJobPath ?? null,
          outputPlanPath: body.outputPlanPath ?? null,
          overwrite: Boolean(body.overwrite),
        }));
      }

      if (request.method === "GET" && pathParts[0] === "api" && pathParts[1] === "runs" && pathParts[2]) {
        return json(response, 200, await loadRunArtifacts({ runId: pathParts[2] }));
      }

      if (request.method === "POST" && url.pathname === "/api/run") {
        const body = await readRequestJson(request);
        if (!body.jobFilePath) {
          return json(response, 400, { error: "jobFilePath is required." });
        }

        const result = await runLeadEngine({
          jobFilePath: body.jobFilePath,
          progressToConsole: false,
        });

        return json(response, 200, {
          runId: result.runId,
          counts: result.manifest.counts,
          runDir: result.runDir,
        });
      }

      if (request.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/app") || url.pathname === "/styles.css" || url.pathname === "/app.js")) {
        const served = await serveStatic(url.pathname === "/app" ? "/index.html" : url.pathname, response);
        if (served) return;
      }

      const served = await serveStatic(url.pathname, response);
      if (served) return;

      sendText(response, 404, "Not Found");
    } catch (error) {
      json(response, 500, { error: error?.message ?? String(error) });
    }
  });
}

const isDirectExecution = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectExecution) {
  const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10) || DEFAULT_PORT;
  createServer().listen(port, () => {
    console.log(`Narrate Lead Engine listening on http://localhost:${port}`);
  });
}
