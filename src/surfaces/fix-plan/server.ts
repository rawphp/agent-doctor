/**
 * One-shot loopback server for fix-plan HTML preview.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type FixPlanServer = {
  url: string;
  port: number;
  close: () => Promise<void>;
};

export function startFixPlanServer(html: string, port = 0): Promise<FixPlanServer> {
  const server = http.createServer((req, res) => {
    res.setHeader('Connection', 'close');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    if (path !== '/' && path !== '/index.html') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(html);
  });

  server.keepAliveTimeout = 1_000;
  server.headersTimeout = 2_000;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${address.port}/`;
      resolve({
        url,
        port: address.port,
        close: () =>
          new Promise((res, rej) => {
            if (!server.listening) {
              res();
              return;
            }
            if (typeof server.closeAllConnections === 'function') {
              server.closeAllConnections();
            }
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
