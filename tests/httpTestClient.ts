import { EventEmitter } from "node:events";
import { PassThrough, Readable } from "node:stream";
import type { Express } from "express";

export interface TestResponse {
  status: number;
  headers: Record<string, string | number | readonly string[]>;
  text: string;
  body: unknown;
}

export async function requestApp(
  app: Express,
  method: string,
  url: string,
  body?: unknown
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    let sent = false;
    const req = new Readable({
      read() {
        if (!sent && payload.length > 0) {
          this.push(payload);
          sent = true;
        }
        this.push(null);
      }
    }) as Readable & {
      method?: string;
      url?: string;
      originalUrl?: string;
      headers?: Record<string, string>;
      socket?: EventEmitter;
      connection?: EventEmitter;
    };

    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.headers =
      payload.length > 0
        ? {
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(payload))
          }
        : {};
    req.socket = new PassThrough();
    req.connection = req.socket;

    const events = new EventEmitter();
    const chunks: Buffer[] = [];
    const headers: Record<string, string | number | readonly string[]> = {};

    const res = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
      setHeader(name: string, value: string | number | readonly string[]) {
        headers[name.toLowerCase()] = value;
        return this;
      },
      getHeader(name: string) {
        return headers[name.toLowerCase()];
      },
      getHeaders() {
        return headers;
      },
      removeHeader(name: string) {
        delete headers[name.toLowerCase()];
      },
      writeHead(
        statusCode: number,
        reasonOrHeaders?:
          | string
          | Record<string, string | number | readonly string[]>,
        maybeHeaders?: Record<string, string | number | readonly string[]>
      ) {
        this.statusCode = statusCode;
        const nextHeaders =
          typeof reasonOrHeaders === "object" ? reasonOrHeaders : maybeHeaders;
        if (nextHeaders) {
          for (const [name, value] of Object.entries(nextHeaders)) {
            this.setHeader(name, value);
          }
        }
        this.headersSent = true;
        return this;
      },
      write(
        chunk: string | Buffer,
        encodingOrCallback?: BufferEncoding | (() => void),
        callback?: () => void
      ) {
        if (chunk) {
          chunks.push(
            Buffer.isBuffer(chunk)
              ? chunk
              : Buffer.from(
                  chunk,
                  typeof encodingOrCallback === "string"
                    ? encodingOrCallback
                    : "utf8"
                )
          );
        }

        const done =
          typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
        done?.();
        return true;
      },
      end(
        chunk?: string | Buffer,
        encodingOrCallback?: BufferEncoding | (() => void),
        callback?: () => void
      ) {
        if (this.writableEnded) {
          return this;
        }

        if (chunk) {
          this.write(chunk, encodingOrCallback, callback);
        }

        this.headersSent = true;
        this.writableEnded = true;
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed: unknown = text;
        try {
          parsed = text.length > 0 ? JSON.parse(text) : undefined;
        } catch {
          parsed = text;
        }

        const done =
          typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
        done?.();
        events.emit("finish");
        events.emit("close");
        resolve({
          status: this.statusCode,
          headers,
          text,
          body: parsed
        });
        return this;
      },
      on: events.on.bind(events),
      once: events.once.bind(events),
      emit: events.emit.bind(events),
      removeListener: events.removeListener.bind(events),
      cork() {
        return undefined;
      },
      uncork() {
        return undefined;
      },
      flushHeaders() {
        this.headersSent = true;
      }
    };

    app.handle(req as never, res as never, (error) => {
      if (error) {
        reject(error);
        return;
      }

      if (!res.writableEnded) {
        res.end();
      }
    });
  });
}
