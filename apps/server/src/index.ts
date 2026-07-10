import express from "express";
import type { Doc } from "core";

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

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
