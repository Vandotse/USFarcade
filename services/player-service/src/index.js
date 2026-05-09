require("dotenv").config();

const cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const { Pool } = require("pg");
const promClient = require("prom-client");

const serviceName = process.env.SERVICE_NAME || "player-service";
const port = Number(process.env.PORT || 3001);

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

function toPlayer(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

function cleanName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function cleanColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#14b8a6";
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

app.get("/players", async (request, response, next) => {
  try {
    const search = cleanName(request.query.search);
    const params = search ? [`%${search}%`] : [];
    const sql = search
      ? "SELECT * FROM players WHERE display_name ILIKE $1 ORDER BY last_seen_at DESC LIMIT 25"
      : "SELECT * FROM players ORDER BY last_seen_at DESC LIMIT 25";
    const { rows } = await pool.query(sql, params);
    response.json({ players: rows.map(toPlayer) });
  } catch (error) {
    next(error);
  }
});

app.get("/players/:id", async (request, response, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [request.params.id]);
    if (!rows[0]) {
      response.status(404).json({ error: "Player not found" });
      return;
    }
    response.json({ player: toPlayer(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/players", async (request, response, next) => {
  try {
    const displayName = cleanName(request.body.displayName);
    if (displayName.length < 2) {
      response.status(400).json({ error: "Display name must be at least 2 characters." });
      return;
    }

    const avatarColor = cleanColor(request.body.avatarColor);

    const existing = await pool.query("SELECT * FROM players WHERE lower(display_name) = lower($1) LIMIT 1", [
      displayName
    ]);

    if (existing.rows[0]) {
      const { rows } = await pool.query(
        `UPDATE players
         SET display_name = $2, avatar_color = $3, last_seen_at = now()
         WHERE id = $1
         RETURNING *`,
        [existing.rows[0].id, displayName, avatarColor]
      );
      response.status(200).json({ player: toPlayer(rows[0]) });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO players (display_name, avatar_color)
       VALUES ($1, $2)
       RETURNING *`,
      [displayName, avatarColor]
    );

    response.status(201).json({ player: toPlayer(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch("/players/:id", async (request, response, next) => {
  try {
    const displayName = cleanName(request.body.displayName);
    const avatarColor = cleanColor(request.body.avatarColor);
    if (displayName.length < 2) {
      response.status(400).json({ error: "Display name must be at least 2 characters." });
      return;
    }

    const { rows } = await pool.query(
      `UPDATE players
       SET display_name = $2, avatar_color = $3, last_seen_at = now()
       WHERE id = $1
         AND NOT EXISTS (
           SELECT 1
           FROM players other
           WHERE other.id <> $1
             AND lower(other.display_name) = lower($2)
         )
       RETURNING *`,
      [request.params.id, displayName, avatarColor]
    );

    if (!rows[0]) {
      const existing = await pool.query("SELECT id FROM players WHERE id = $1", [request.params.id]);
      response.status(existing.rows[0] ? 409 : 404).json({
        error: existing.rows[0] ? "Display name is already taken." : "Player not found"
      });
      return;
    }
    response.json({ player: toPlayer(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(JSON.stringify({ level: "error", service: serviceName, message: error.message }));
  response.status(500).json({ error: "Player service failed." });
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
