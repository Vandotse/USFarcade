require("dotenv").config();

const cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const { Pool } = require("pg");
const promClient = require("prom-client");

const serviceName = process.env.SERVICE_NAME || "leaderboard-service";
const port = Number(process.env.PORT || 3004);

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

function clampLimit(value) {
  const parsed = Number(value || 10);
  if (!Number.isInteger(parsed)) return 10;
  return Math.max(1, Math.min(parsed, 50));
}

function toEntry(row) {
  return {
    id: row.id,
    rank: Number(row.rank),
    playerId: row.player_id,
    displayName: row.display_name,
    gameSlug: row.game_slug,
    gameTitle: row.game_title,
    scoreValue: row.score_value,
    durationMs: row.duration_ms,
    moves: row.moves,
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

app.get("/leaderboards/:gameSlug", async (request, response, next) => {
  try {
    const limit = clampLimit(request.query.limit);
    const { rows } = await pool.query(
      `WITH player_bests AS (
         SELECT
           s.id,
           s.player_id,
           p.display_name,
           s.game_slug,
           g.title AS game_title,
           g.scoring_direction,
           s.score_value,
           s.duration_ms,
           s.moves,
           s.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY s.player_id
             ORDER BY
               CASE WHEN g.scoring_direction = 'ASC' THEN s.score_value END ASC NULLS LAST,
               CASE WHEN g.scoring_direction = 'DESC' THEN s.score_value END DESC NULLS LAST,
               s.created_at ASC
           ) AS player_score_rank
         FROM scores s
         JOIN players p ON p.id = s.player_id
         JOIN games g ON g.slug = s.game_slug
         WHERE s.game_slug = $1
       ),
       ranked AS (
         SELECT
           id,
           player_id,
           display_name,
           game_slug,
           game_title,
           score_value,
           duration_ms,
           moves,
           created_at,
           RANK() OVER (
             ORDER BY
               CASE WHEN scoring_direction = 'ASC' THEN score_value END ASC NULLS LAST,
               CASE WHEN scoring_direction = 'DESC' THEN score_value END DESC NULLS LAST,
               created_at ASC
           ) AS rank
         FROM player_bests
         WHERE player_score_rank = 1
       )
       SELECT *
       FROM ranked
       ORDER BY rank ASC, created_at ASC
       LIMIT $2`,
      [request.params.gameSlug, limit]
    );

    response.json({ leaderboard: rows.map(toEntry) });
  } catch (error) {
    next(error);
  }
});

app.get("/leaderboards/player/:playerId", async (request, response, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         s.game_slug,
         g.title AS game_title,
         COUNT(*)::int AS submissions,
         MIN(CASE WHEN g.scoring_direction = 'ASC' THEN s.score_value END) AS best_low_score,
         MAX(CASE WHEN g.scoring_direction = 'DESC' THEN s.score_value END) AS best_high_score,
         MAX(s.created_at) AS last_submission_at
       FROM scores s
       JOIN games g ON g.slug = s.game_slug
       WHERE s.player_id = $1
       GROUP BY s.game_slug, g.title
       ORDER BY last_submission_at DESC`,
      [request.params.playerId]
    );
    response.json({ summary: rows });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(JSON.stringify({ level: "error", service: serviceName, message: error.message }));
  response.status(500).json({ error: "Leaderboard service failed." });
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
