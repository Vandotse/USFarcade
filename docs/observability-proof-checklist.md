# Observability Proof Checklist

Use this checklist to prove the observability rubric before moving into the Day 2 demos.

## 1. Cluster Health

```bash
kubectl get pods -n monitoring
kubectl get pods -n usfarcade
kubectl get ingress -n monitoring
kubectl get ingress -n usfarcade
```

Expected result:

- Prometheus, Alertmanager, Grafana, Loki, and Promtail are running in EKS.
- The app ingress and Grafana ingress both have external ALB hostnames.
- Grafana is reachable at `https://grafana.dev.evantestspa-demo.xyz`.

## 2. Metrics Dashboard

In Grafana, open the built-in Kubernetes dashboards and show:

- node CPU
- node memory
- node disk space
- pod restarts
- workload health

Presentation line:

```text
Prometheus scrapes Kubernetes and node-exporter metrics inside the cluster. Grafana visualizes CPU, memory, disk, and workload health without AWS managed monitoring.
```

## 3. Centralized Logs

Open Grafana Explore and choose the Loki data source.

Show all backend logs:

```logql
{namespace="usfarcade", service=~"player-service|game-service|score-service|leaderboard-service"}
```

Narrow to score submissions:

```logql
{namespace="usfarcade", service="score-service"} |~ "(?i)score|submit|leaderboard"
```

Search for failures:

```logql
{namespace="usfarcade"} |~ "(?i)error|failed|exception|timeout"
```

Presentation line:

```text
Promtail ships pod logs to Loki with namespace, pod, container, and service labels. This lets us query across all backend microservices from one place.
```

## 4. Alert Routing Proof

Apply the temporary demo alert:

```bash
kubectl apply -f infra/k8s/observability/demo-slack-alert.yaml
```

Wait about two minutes, then check alert state:

```bash
kubectl port-forward svc/kube-prometheus-stack-alertmanager -n monitoring 9093:9093
```

Open:

```text
http://localhost:9093/#/alerts
```

Expected result:

- `USFarcadeDemoSlackAlert` is firing.
- Slack receives a critical alert from Alertmanager.

Clean up immediately after the proof:

```bash
kubectl delete -f infra/k8s/observability/demo-slack-alert.yaml
```

Presentation line:

```text
The permanent alerts watch node CPU, memory, disk, and pod restarts. This temporary alert safely proves the Slack route without intentionally stressing the cluster.
```

## 5. Evidence To Capture

Capture screenshots or show live:

- Grafana login via GitHub OAuth
- node CPU/memory/disk dashboard
- Loki Explore query across all backend services
- Slack alert message from `USFarcadeDemoSlackAlert`
- `kubectl get pods -n monitoring`

