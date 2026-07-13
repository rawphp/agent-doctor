/**
 * Tiny local HTML dashboard server (design §10).
 * Binds loopback only. Renders the same Report — does not call fix apply.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Report } from "../../engine/types.js";
import { renderDashboardHtml } from "./template.js";

export type DashboardServerOptions = {
  report: Report;
  /** Port to bind; 0 = ephemeral free port. Default 0. */
  port?: number;
  /** Host — fixed to loopback for safety; option kept for tests/docs. */
  host?: "127.0.0.1" | "localhost";
};

export type DashboardServer = {
  url: string;
  port: number;
  address: AddressInfo | string | null;
  close: () => Promise<void>;
};

/**
 * Start a read-only HTTP server serving the dashboard HTML for `report`.
 * Always binds 127.0.0.1 (loopback) — never 0.0.0.0.
 */
export function startDashboardServer(
  options: DashboardServerOptions,
): Promise<DashboardServer> {
  const report = options.report;
  // Force loopback only — ignore non-loopback host attempts.
  const host =
    options.host === "localhost" ? "localhost" : "127.0.0.1";
  const port = options.port ?? 0;
  const html = renderDashboardHtml(report);

  const server = http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, {
        Allow: "GET, HEAD",
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end("Method Not Allowed");
      return;
    }

    const url = req.url ?? "/";
    const path = url.split("?")[0] ?? "/";
    if (path !== "/" && path !== "/index.html") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(html);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const boundPort =
        typeof address === "object" && address !== null ? address.port : port;
      const urlHost = host === "localhost" ? "localhost" : "127.0.0.1";
      const url = `http://${urlHost}:${boundPort}/`;

      resolve({
        url,
        port: boundPort,
        address,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
