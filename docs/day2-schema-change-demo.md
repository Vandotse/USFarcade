# Day 2 Schema Change Demo

This demo proves a safe RDS schema change during a normal Git-driven deployment.

## Change Being Demonstrated

ByteBattle Arena adds visible achievement badge metadata:

- `achievements.icon`
- `achievements.rarity`

The backend already knows how to award achievements when a player submits a qualifying score. This Day 2 change makes those achievements visible in the frontend profile panel.

## Why This Is Backward Compatible

The migration is safe for zero-downtime rollout because it only adds columns with defaults:

```sql
ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'award',
  ADD COLUMN IF NOT EXISTS rarity TEXT NOT NULL DEFAULT 'bronze';
```

Old pods ignore these columns. New pods read them after the migration job has completed. No existing column is renamed, removed, or made stricter during the rollout.

## Deployment Order

The GitHub deployment action uses this order:

1. Apply Kubernetes manifests, including the updated migration ConfigMap.
2. Delete the previous migration Job if it exists.
3. Run `usfarcade-schema-migration`.
4. Wait for the migration Job to complete.
5. Update the service image tags.
6. Wait for all Kubernetes rollouts to finish.

That means the database shape is ready before new backend pods serve traffic.

## Files To Show

Migration source:

```text
database/migrations/004_achievement_badge_metadata.sql
infra/k8s/base/migration-configmap.yaml
```

Backend changes:

```text
services/score-service/src/index.js
services/player-service/src/index.js
```

Frontend proof:

```text
frontend/src/App.jsx
frontend/src/lib/api.js
frontend/src/styles.css
```

CI/CD migration runner:

```text
.github/actions/deploy-k8s-overlay/action.yml
```

## Local Verification

For a fresh local database, Docker Compose runs `database/init/001_schema.sql` automatically.

If an old local Postgres volume already exists, apply the migration manually:

```bash
docker compose exec -T postgres psql \
  -U usfarcade \
  -d usfarcade \
  -f /dev/stdin < database/migrations/004_achievement_badge_metadata.sql
```

Then rebuild and run:

```bash
docker compose up --build
```

## Live Demo Flow

1. Open `https://dev.evantestspa-demo.xyz`.
2. Save a player profile.
3. Submit a qualifying score:
   - Reaction Speed under `250 ms`, or
   - Memory Match in `12` moves or fewer.
4. Show the badge shelf in the profile panel.
5. Show Loki logs for the score path:

```logql
{namespace="usfarcade", service="score-service"} |~ "(?i)score|achievement|badge"
```

6. Show the database migration job:

```bash
kubectl logs job/usfarcade-schema-migration -n usfarcade
kubectl get job usfarcade-schema-migration -n usfarcade
```

## Presentation Line

```text
This is an expand-and-read schema change. We add nullable/defaulted metadata first, run the migration as a Kubernetes Job, wait for it to complete in CI/CD, and only then roll out backend and frontend code that reads the new fields.
```

