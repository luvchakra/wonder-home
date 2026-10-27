import { createServer, type Server } from "node:http";

/** The health endpoint Fly checks (GET /health). Nothing else is exposed. */
export function startHealthServer(port: number, log: (message: string) => void): Server {
  const server = createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  server.listen(port, "0.0.0.0", () => log(`[server] health endpoint listening on :${port}`));
  return server;
}
