import express from "express";
import type { Doc } from "core";
import { search } from "core";
import db from "core/db";

const app = express();

app.get("/api/health", (_req, res) => {
  const placeholder: Doc = {
    id: "simplewiki:0",
    title: "ok",
    body: "server can import core",
    kind: "article",
  };
  res.json({ status: "ok", sample: placeholder });
});

app.get("/api/search", (req, res) => {
  const query = (req.query.q ?? "") as string;
  const k1 = parseFloat((req.query.k1 as string) || "1.2");
  const b = parseFloat((req.query.b as string) || "0.75");
  const topK = parseInt((req.query.topk as string) || "25", 10);
  const results = search(db, query, { k1, b, topK });
  res.json({ results });
});

app.get("/", (_req, res) => {
  // Serve index.html from ../../web/
  res.sendFile("index.html", { root: "../web/" });
});

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
