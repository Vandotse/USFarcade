# Canary Rollouts

ByteBattle Arena uses canary as the selected EKS deployment strategy for the user-facing score path.

The normal app services still use Kubernetes rolling updates for zero downtime. `score-service` can be promoted to an Argo Rollouts canary because score submission is the riskiest and easiest path to verify with metrics.

## Why Canary

Canary fits this app because:

- score submissions and leaderboard updates are user-facing
- a small traffic slice can validate the new version before full rollout
- the rollout can automatically stop if `score-service` starts returning 5xx responses
- it is simpler to explain live than duplicating the full stack for blue/green

## Install Argo Rollouts

Run once per cluster:

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

helm upgrade --install argo-rollouts argo/argo-rollouts \
  --namespace argo-rollouts \
  --create-namespace
```

Verify:

```bash
kubectl get pods -n argo-rollouts
kubectl api-resources | grep -i rollout
```

Optional local CLI plugin for manual promote/abort commands:

```bash
brew install argoproj/tap/kubectl-argo-rollouts
```

## Activate The Score-Service Canary

Prometheus/Grafana must already be installed because the canary analysis uses Prometheus.

Apply the rollout resources:

```bash
kubectl apply -k infra/k8s/rollouts
```

Check status:

```bash
kubectl get rollout score-service -n usfarcade
kubectl describe rollout score-service -n usfarcade
```

The rollout uses `workloadRef` to reference the existing `score-service` Deployment. That keeps the deployment manifest as the source of the pod template while Argo Rollouts controls canary promotion.

## What The Canary Does

The canary steps are:

```text
10% for 2 minutes
50% for 5 minutes
100%
```

The analysis query watches the real app metric from `score-service`:

```promql
sum(rate(http_requests_total{namespace="usfarcade",service="score-service",status=~"5.."}[2m]))
```

The canary succeeds only while the 5xx rate stays at zero.

## Live Demo Commands

Watch rollout:

```bash
kubectl get rollout score-service -n usfarcade -w
```

Watch pods:

```bash
kubectl get pods -n usfarcade -l app.kubernetes.io/component=score-service -w
```

Generate traffic:

```bash
while true; do
  curl -sk -o /dev/null -w "HTTP %{http_code} %{time_total}s\n" https://dev.evantestspa-demo.xyz
  sleep 2
done
```

If something goes wrong, abort:

```bash
kubectl argo rollouts abort score-service -n usfarcade
```

If the canary is healthy and paused, promote:

```bash
kubectl argo rollouts promote score-service -n usfarcade
```

## Presentation Line

```text
We chose canary because score submissions are user-facing and measurable. Argo Rollouts shifts the score-service rollout through 10%, 50%, and 100%, and Prometheus analysis stops promotion if the service starts returning 5xx responses. That gives us zero-downtime promotion with an automatic safety gate.
```
