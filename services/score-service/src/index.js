require("dotenv").config();

const cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const { Pool } = require("pg");
const promClient = require("prom-client");

const serviceName = process.env.SERVICE_NAME || "score-service";
const port = Number(process.env.PORT || 3003);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "96kb" }));
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

function toScore(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    gameSlug: row.game_slug,
    seasonId: row.season_id,
    scoreValue: row.score_value,
    durationMs: row.duration_ms,
    moves: row.moves,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

function toAchievement(row) {
  return {
    code: row.code,
    title: row.title,
    description: row.description,
    gameSlug: row.game_slug,
    icon: row.icon,
    rarity: row.rarity,
    awardedAt: row.awarded_at
  };
}

function readInteger(value, name, allowNull = false) {
  if (value === null || value === undefined || value === "") {
    if (allowNull) return null;
    throw new Error(`${name} is required.`);
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return number;
}

async function awardAchievements(client, playerId, gameSlug, scoreValue, moves) {
  const achievementCodes = [];
  if (gameSlug === "reaction-speed" && scoreValue < 250) achievementCodes.push("sub-250");
  if (gameSlug === "memory-match" && moves !== null && moves <= 12) achievementCodes.push("perfect-grid");
  if (achievementCodes.length === 0) return [];

  const { rows } = await client.query(
    `WITH newly_awarded AS (
       INSERT INTO player_achievements (player_id, achievement_id)
       SELECT $1, id
       FROM achievements
       WHERE code = ANY($2::text[])
       ON CONFLICT DO NOTHING
       RETURNING achievement_id, awarded_at
     )
     SELECT
       a.code,
       a.title,
       a.description,
       a.game_slug,
       a.icon,
       a.rarity,
       newly_awarded.awarded_at
     FROM newly_awarded
     JOIN achievements a ON a.id = newly_awarded.achievement_id
     ORDER BY newly_awarded.awarded_at DESC`,
    [playerId, achievementCodes]
  );
  return rows.map(toAchievement);
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

app.get("/scores/recent", async (_request, response, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM scores ORDER BY created_at DESC LIMIT 20");
    response.json({ scores: rows.map(toScore) });
  } catch (error) {
    next(error);
  }
});

app.post("/scores", async (request, response, next) => {
  const client = await pool.connect();
  try {
    const playerId = String(request.body.playerId || "").trim();
    const gameSlug = String(request.body.gameSlug || "").trim();
    const scoreValue = readInteger(request.body.scoreValue, "scoreValue");
    const durationMs = readInteger(request.body.durationMs, "durationMs", true);
    const moves = readInteger(request.body.moves, "moves", true);
    const metadata = request.body.metadata && typeof request.body.metadata === "object" ? request.body.metadata : {};

    await client.query("BEGIN");

    const player = await client.query("SELECT id FROM players WHERE id = $1", [playerId]);
    if (!player.rows[0]) {
      response.status(404).json({ error: "Player not found." });
      await client.query("ROLLBACK");
      return;
    }

    const game = await client.query("SELECT slug FROM games WHERE slug = $1", [gameSlug]);
    if (!game.rows[0]) {
      response.status(404).json({ error: "Game not found." });
      await client.query("ROLLBACK");
      return;
    }

    const season = await client.query(
      `SELECT id
       FROM seasons
       WHERE now() >= starts_at AND now() < ends_at
       ORDER BY starts_at DESC
       LIMIT 1`
    );

    const insert = await client.query(
      `INSERT INTO scores (player_id, game_slug, season_id, score_value, duration_ms, moves, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [playerId, gameSlug, season.rows[0]?.id || null, scoreValue, durationMs, moves, metadata]
    );

    const awardedAchievements = await awardAchievements(client, playerId, gameSlug, scoreValue, moves);
    await client.query("UPDATE players SET last_seen_at = now() WHERE id = $1", [playerId]);
    await client.query("COMMIT");

    response.status(201).json({
      score: toScore(insert.rows[0]),
      awardedAchievements
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.message.includes("required") || error.message.includes("non-negative")) {
      response.status(400).json({ error: error.message });
      return;
    }
    next(error);
  } finally {
    client.release();
  }
});

app.use((error, _request, response, _next) => {
  console.error(JSON.stringify({ level: "error", service: serviceName, message: error.message }));
  response.status(500).json({ error: "Score service failed." });
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
