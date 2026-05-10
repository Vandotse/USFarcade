# Day 2 OS/Security Patching Demo

This demo proves that worker node patching is controlled by Terraform and EKS managed node groups, not the AWS Console.

## What Gets Patched

The EKS managed node group uses the standard Amazon Linux 2023 EKS optimized AMI:

```hcl
ami_type = "AL2023_x86_64_STANDARD"
```

AWS publishes recommended EKS optimized AMI metadata through SSM Parameter Store. The Terraform module can now either:

- let EKS choose the node AMI release,
- pin an explicit `node_release_version`, or
- use `node_release_version = "latest"` to read the latest AL2023 recommendation from SSM.

## Why This Is Zero Downtime

The node group is configured with:

```hcl
update_config {
  max_unavailable = 1
}
```

The app is configured with:

- 3 replicas per service
- readiness probes
- liveness probes
- PodDisruptionBudgets with `minAvailable: 2`
- ALB target health checks

During rotation, EKS drains and replaces one node at a time. Kubernetes keeps at least two replicas available for every app service, and the ALB only sends traffic to ready pods.

## Preflight Checks

Refresh AWS SSO if needed:

```bash
AWS_PROFILE=usfarcade aws sso login
```

Check current nodes, pods, and disruption budgets:

```bash
kubectl get nodes -o wide
kubectl get pods -n usfarcade -o wide
kubectl get pdb -n usfarcade
```

Check the current managed node group release:

```bash
AWS_PROFILE=usfarcade aws eks describe-nodegroup \
  --region us-east-1 \
  --cluster-name usfarcade-dev \
  --nodegroup-name usfarcade-dev-primary \
  --query 'nodegroup.{status:status,version:version,releaseVersion:releaseVersion,desired:scalingConfig.desiredSize}'
```

Check AWS's current recommended AL2023 EKS optimized AMI metadata:

```bash
AWS_PROFILE=usfarcade aws ssm get-parameter \
  --region us-east-1 \
  --name /aws/service/eks/optimized-ami/1.30/amazon-linux-2023/x86_64/standard/recommended \
  --query Parameter.Value \
  --output text
```

## Terraform Patch Flow

In local `infra/terraform/environments/dev/terraform.tfvars`, set:

```hcl
node_release_version      = "latest"
node_force_update_version = true
```

Then run:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev fmt -recursive
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev plan
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev apply
```

If Terraform reports no changes, that means the node group is already on the latest recommended release. For the presentation, say that directly and show the current node group release matching the SSM recommended release.

If Terraform shows a node group update, apply it and watch rotation.

## Watch During Rotation

Terminal 1: watch traffic.

```bash
while true; do
  date "+%H:%M:%S"
  curl -sk -o /dev/null -w "HTTP %{http_code} %{time_total}s\n" https://dev.evantestspa-demo.xyz
  sleep 2
done
```

Terminal 2: watch nodes and pods.

```bash
kubectl get nodes -w
```

Terminal 3:

```bash
kubectl get pods -n usfarcade -o wide -w
```

Grafana:

- node CPU
- node memory
- pod restarts
- workload health

Loki query:

```logql
{namespace="usfarcade"} |~ "(?i)terminating|started|listening|error|failed"
```

## Success Criteria

- Terraform owns the patch operation.
- EKS node group updates one unavailable node at a time.
- Pods reschedule onto healthy nodes.
- PDBs prevent too many replicas from going down at once.
- The app keeps returning HTTP `200`.
- Grafana shows node/pod movement without service outage.

## Presentation Line

```text
For OS patching, we do not SSH into nodes or click around the AWS Console. Terraform updates the EKS managed node group to the desired AL2023 EKS optimized AMI release. EKS drains and replaces one node at a time, while our PDBs, readiness probes, replicas, and ALB health checks keep user traffic flowing.
```

