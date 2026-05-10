# Git-Driven Promotion

ByteBattle Arena uses GitHub Actions as the promotion controller. Deployments are triggered by Git events, not by clicking deploy buttons in the AWS Console.

## Promotion Flow

```text
main branch -> Dev
nightly schedule -> QA build
RC commit or merged PR -> UAT
version tag -> Prod
```

## Workflow Triggers

| Stage | Workflow | Trigger | Artifact tag |
| --- | --- | --- | --- |
| Dev | `Dev Deploy` | Push to `main` | `dev-<git-sha>` plus `dev` |
| Nightly QA | `Nightly QA Build` | Daily scheduled build at `07:00 UTC` | `qa-<run>-<git-sha>` plus `qa` |
| UAT | `Promote UAT` | Merged PR to `main`, or a commit message containing `RC1`, `RC2`, etc. | `rc-<run>-<git-sha>` plus `rc` |
| Prod | `Release Production` | Git tag matching `v*.*.*`, for example `v1.0.1` | exact version tag plus `stable` |

## Required GitHub Repository Variables

Set these in GitHub under `Settings -> Secrets and variables -> Actions -> Variables`.

```text
AWS_ACCOUNT_ID=881933021016
AWS_REGION=us-east-1
AWS_ROLE_TO_ASSUME=arn:aws:iam::881933021016:role/usfarcade-dev-github-actions-deploy
EKS_CLUSTER_DEV=usfarcade-dev
EKS_CLUSTER_UAT=usfarcade-uat
EKS_CLUSTER_PROD=usfarcade-prod
K8S_NAMESPACE=usfarcade
```

The workflows use GitHub OIDC and `AWS_ROLE_TO_ASSUME`; no long-lived AWS access keys should be stored in GitHub.

## Zero-Downtime Mechanics

Each service deployment uses:

- `replicas: 3`
- readiness probes
- liveness probes
- rolling updates with `maxUnavailable: 0`
- `maxSurge: 1`
- PodDisruptionBudgets
- a `preStop` delay for graceful connection draining

The deployment workflow waits for every rollout to complete. A failed rollout stops promotion before the next environment.

## Schema Migration Order

Each deployment applies Kubernetes manifests, reruns the schema migration job, waits for it to complete, then deploys the new immutable image tags.

Migrations must stay backward compatible:

1. Add nullable columns or new tables first.
2. Deploy backend services that can read/write both old and new shapes.
3. Backfill data if needed.
4. Enforce stricter constraints only after old code is gone.

## Deployment Strategy: Canary

ByteBattle Arena uses canary as the chosen EKS release strategy.

Why canary fits this app:

- score submission and leaderboard behavior are user-facing and easy to measure
- a small traffic slice can prove the new version before full rollout
- failed canaries can be rolled back before most users are affected
- it is easier to defend in a live chaos/demo setting than a full duplicate blue/green stack

The current GitHub Actions workflows deploy with Kubernetes zero-downtime rolling updates by default. The canary resources under `infra/k8s/rollouts` activate Argo Rollouts for `score-service` once the Argo Rollouts controller is installed in the cluster.

When Argo Rollouts is activated for `score-service`, the shared deploy action detects `rollout/score-service` and waits for the Argo Rollout to become `Healthy` instead of waiting on the underlying Deployment. See `docs/canary-rollouts.md`.
