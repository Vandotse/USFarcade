require("dotenv").config();

const cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const { Pool } = require("pg");
const promClient = require("prom-client");

const serviceName = process.env.SERVICE_NAME || "game-service";
const port = Number(process.env.PORT || 3002);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));
app.use(morgan(":method :url :status :res[content-length] - :response-time ms"));

const register = new promClient.Registry();
register.setDefaultLabels({ service: serviceName });
promClient.collectDefaultMetrics({ register });
const httpRequests = new promClient.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["service", "method", "route", "status"]
});
const httpDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["service", "method", "route", "status"],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2]
});
register.registerMetric(httpRequests);
register.registerMetric(httpDuration);

app.use((request, response, next) => {
  const end = httpDuration.startTimer();
  response.on("finish", () => {
    const route = request.route?.path || request.path;
    const labels = { service: serviceName, method: request.method, route, status: String(response.statusCode) };
    httpRequests.inc(labels);
    end(labels);
  });
  next();
});

function toGame(row) {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    scoringDirection: row.scoring_direction,
    rules: row.rules,
    createdAt: row.created_at
  };
}

app.get("/healthz", (_request, response) => {
  response.json({ ok: true, service: serviceName });
});

app.get("/metrics", async (_request, response) => {
  response.set("Content-Type", register.contentType);
  response.end(await register.metrics());
});

app.get("/readyz", async (_request, response, next) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ready: true, service: serviceName });
  } catch (error) {
    next(error);
  }
});

app.get("/games", async (_request, response, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM games ORDER BY title ASC");
    response.json({ games: rows.map(toGame) });
  } catch (error) {
    next(error);
  }
});

app.get("/games/:slug", async (request, response, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM games WHERE slug = $1", [request.params.slug]);
    if (!rows[0]) {
      response.status(404).json({ error: "Game not found" });
      return;
    }
    response.json({ game: toGame(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(JSON.stringify({ level: "error", service: serviceName, message: error.message }));
  response.status(500).json({ error: "Game service failed." });
});

const server = app.listen(port, () => {
  console.log(JSON.stringify({ level: "info", service: serviceName, message: `listening on ${port}` }));
});

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
