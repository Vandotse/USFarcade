# ByteBattle Arena

Local-first arcade app for the USFarcade cloud architecture project. The local stack runs without AWS or Terraform:

- React frontend served by nginx
- PostgreSQL database
- `player-service`
- `game-service`
- `score-service`
- `leaderboard-service`

## Test Locally

Start everything:

```bash
docker compose up --build -d
```

Open the app:

```text
http://localhost:8080
```

Useful local endpoints:

```text
http://localhost:8080/api/games
http://localhost:8080/api/leaderboards/reaction-speed
http://localhost:3001/readyz
http://localhost:3002/readyz
http://localhost:3003/readyz
http://localhost:3004/readyz
```

Stop the stack:

```bash
docker compose stop
```

Reset local database state:

```bash
docker compose down -v
```

## Cloud Promotion

GitHub Actions workflows are defined under `.github/workflows` for Dev, Nightly QA, UAT, and Prod promotion. See `docs/cicd-promotion.md` for trigger rules, required GitHub variables, and the zero-downtime deployment story.
