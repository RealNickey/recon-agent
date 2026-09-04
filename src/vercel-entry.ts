import type { IncomingMessage, ServerResponse } from "node:http";
import { app } from "./index";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const url = new URL(req.url || "/", `${protocol}://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }
    }

    let body: Buffer | undefined = undefined;
    if (req.method && !["GET", "HEAD"].includes(req.method.toUpperCase())) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      if (chunks.length > 0) {
        body = Buffer.concat(chunks);
      }
    }

    const webRequest = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
      // @ts-ignore
      duplex: "half",
    });

    const response = await app.fetch(webRequest);

    res.statusCode = response.status;
    res.statusMessage = response.statusText;

    response.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    if (response.body) {
      const arrayBuffer = await response.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error("Vercel Serverless Function Error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err?.message || "Internal Server Error" }));
  }
}
