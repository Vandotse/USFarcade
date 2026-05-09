# Kubernetes Runbook

Render the manifests locally:

```bash
kubectl kustomize infra/k8s/overlays/dev
kubectl kustomize infra/k8s/overlays/uat
kubectl kustomize infra/k8s/overlays/prod
```

Apply after Terraform creates the cluster and RDS secret:

```bash
kubectl apply -k infra/k8s/overlays/dev
```

Run the schema migration job:

```bash
kubectl delete job usfarcade-schema-migration -n usfarcade --ignore-not-found
kubectl apply -k infra/k8s/overlays/dev
kubectl wait --for=condition=complete job/usfarcade-schema-migration -n usfarcade --timeout=120s
```

Check rollout health:

```bash
kubectl rollout status deployment/frontend -n usfarcade
kubectl rollout status deployment/player-service -n usfarcade
kubectl rollout status deployment/game-service -n usfarcade
kubectl rollout status deployment/score-service -n usfarcade
kubectl rollout status deployment/leaderboard-service -n usfarcade
```

Get the ALB hostname:

```bash
kubectl get ingress usfarcade -n usfarcade
```

Use that hostname to fill `alb_dns_name` and `alb_zone_id` in Terraform if Route53 A records will be Terraform-managed.

## Zero-Downtime Mechanics

Each app deployment uses:

- 3 replicas
- readiness probes
- liveness probes
- rolling updates with `maxUnavailable: 0`
- graceful shutdown delay
- PodDisruptionBudgets with `minAvailable: 2`

This is the baseline zero-downtime story for app rollouts and node patching.

## Canary Strategy

The project chooses canary for EKS because score submission and leaderboards are user-facing and easy to validate with metrics. A canary release lets us send 10%, then 50%, then 100% of traffic to a new version while watching errors and latency.

The optional Argo Rollouts manifests live in:

```text
infra/k8s/rollouts
```

Use them after the basic deployment path works.

