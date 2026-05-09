# Observability Runbook

This project uses only self-hosted observability inside EKS:

- Prometheus via `kube-prometheus-stack`
- Grafana via `kube-prometheus-stack`
- Alertmanager via `kube-prometheus-stack`
- Loki and Promtail via `loki-stack`

Grafana is exposed externally at:

```text
https://grafana.dev.evantestspa-demo.xyz
```

Local username/password login is disabled. GitHub OAuth is the intended access path.

## 1. Create the Grafana DNS Certificate

Add this to your local, ignored Terraform file:

```hcl
# infra/terraform/environments/dev/terraform.tfvars
grafana_domain_name = "grafana.dev.evantestspa-demo.xyz"
```

Then apply Terraform:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev plan
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev apply
```

Copy the certificate ARN:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev output grafana_certificate_arn
```

Replace `GRAFANA_CERTIFICATE_ARN_REPLACE_ME` in:

```text
infra/k8s/observability/grafana-ingress.yaml
```

## 2. Create the GitHub OAuth App

In GitHub, create a new OAuth app:

```text
Homepage URL: https://grafana.dev.evantestspa-demo.xyz
Authorization callback URL: https://grafana.dev.evantestspa-demo.xyz/login/github
```

Grafana requests these GitHub scopes:

```text
read:user user:email read:org
```

`read:org` is required because Grafana's GitHub auth provider checks organization/team membership during login.

Create the Kubernetes secret:

```bash
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user="disabled-local-admin" \
  --from-literal=admin-password="$(openssl rand -base64 32)"

kubectl -n monitoring create secret generic grafana-oauth \
  --from-literal=client_id="PASTE_GITHUB_CLIENT_ID" \
  --from-literal=client_secret="PASTE_GITHUB_CLIENT_SECRET"
```

## 3. Create the Alert Secret

Slack is the simplest alert destination for the live demo.

```bash
kubectl -n monitoring create secret generic alertmanager-slack-webhook \
  --from-literal=url="PASTE_SLACK_WEBHOOK_URL"
```

If Slack is not available, swap the Alertmanager receiver in `kube-prometheus-stack-values.yaml` for email SMTP settings.

## 4. Install Prometheus, Grafana, Alertmanager, Loki

The right storage path is EBS-backed persistence through the EKS EBS CSI driver. The add-on and its IAM role are managed by Terraform.

If the EBS CSI add-on was created manually before Terraform owned it, import it once:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev import \
  aws_eks_addon.ebs_csi_driver \
  usfarcade-dev:aws-ebs-csi-driver
```

Then apply Terraform so the add-on receives the IRSA role with `AmazonEBSCSIDriverPolicy`:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev apply
```

Verify the controller is healthy:

```bash
kubectl get pods -n kube-system | grep ebs
kubectl get sa ebs-csi-controller-sa -n kube-system -o yaml | grep eks.amazonaws.com/role-arn
```

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --values infra/k8s/observability/kube-prometheus-stack-values.yaml

helm upgrade --install loki grafana/loki-stack \
  --namespace monitoring \
  --values infra/k8s/observability/loki-stack-values.yaml

kubectl apply -f infra/k8s/observability/critical-resource-alerts.yaml
kubectl apply -f infra/k8s/observability/grafana-ingress.yaml
```

If pods are stuck in `Pending` with `pod has unbound immediate PersistentVolumeClaims`, confirm the cluster storage class:

```bash
kubectl get storageclass
```

This repo's values use the default EKS `gp2` storage class explicitly. If PVCs were already created before that setting was present, delete only the pending monitoring PVCs and rerun the Helm upgrades:

```bash
kubectl delete pvc -n monitoring \
  alertmanager-kube-prometheus-stack-alertmanager-db-alertmanager-kube-prometheus-stack-alertmanager-0 \
  alertmanager-kube-prometheus-stack-alertmanager-db-alertmanager-kube-prometheus-stack-alertmanager-1 \
  kube-prometheus-stack-grafana \
  prometheus-kube-prometheus-stack-prometheus-db-prometheus-kube-prometheus-stack-prometheus-0 \
  prometheus-kube-prometheus-stack-prometheus-db-prometheus-kube-prometheus-stack-prometheus-1 \
  storage-loki-0
```

## 5. Create the Grafana DNS Record

Wait for the Grafana ALB:

```bash
kubectl get ingress grafana -n monitoring
```

Copy the ALB hostname and hosted zone ID. The AWS ALB hosted zone ID in `us-east-1` is usually:

```text
Z35SXDOTRQ7X7K
```

Add these to local Terraform:

```hcl
grafana_alb_dns_name = "PASTE_GRAFANA_ALB_DNS_NAME"
grafana_alb_zone_id  = "Z35SXDOTRQ7X7K"
```

Apply Terraform again:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev apply
```

## 6. Verify Metrics

```bash
kubectl get pods -n monitoring
kubectl get ingress grafana -n monitoring
```

In Grafana, use the built-in Kubernetes dashboards to show:

- node CPU
- node memory
- node disk space
- pod restarts
- workload health

Grafana intentionally runs as one replica with a `Recreate` deployment strategy in this demo because the chart uses its local SQLite database on one EBS `ReadWriteOnce` volume. Prometheus and Alertmanager still run with two replicas; production Grafana HA would use an external database such as PostgreSQL.

## 7. Verify Logs

In Grafana Explore, choose the Loki data source.

Useful queries:

```logql
{namespace="usfarcade"}
{namespace="usfarcade", service="player-service"}
{namespace="usfarcade", service="game-service"}
{namespace="usfarcade", service="score-service"}
{namespace="usfarcade", service="leaderboard-service"}
```

This proves centralized log querying across all backend microservices.

## 8. Defense Talking Points

Prometheus, Grafana, Alertmanager, Loki, and Promtail all run inside EKS. No AWS managed monitoring service is used.

Grafana is externally reachable, but local username/password login is disabled. Access goes through GitHub OAuth.

Alertmanager sends critical resource alerts through Slack. The custom `PrometheusRule` covers CPU, memory, disk, and repeated pod restarts.
