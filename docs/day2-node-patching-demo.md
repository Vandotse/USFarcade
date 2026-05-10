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

For the live demo, the module also supports a patch-wave rotation ID:

```hcl
node_group_rotation_id = "patch-001"
```

Changing that ID changes the managed node group name. Terraform then creates the new node group before destroying the old one, which guarantees visible node replacement even if the current AMI is already up to date.

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

During an in-place release update, EKS drains and replaces one node at a time. During the guaranteed live patch wave, Terraform first creates a new node group and then deletes the old one. In both cases, Kubernetes keeps at least two replicas available for every app service, and the ALB only sends traffic to ready pods.

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

Check Terraform's current managed node group name:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev output node_group_name
```

Check the current managed node group release. Use the output name from the previous command:

```bash
NODE_GROUP=$(AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev output -raw node_group_name)

AWS_PROFILE=usfarcade aws eks describe-nodegroup \
  --region us-east-1 \
  --cluster-name usfarcade-dev \
  --nodegroup-name "$NODE_GROUP" \
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

## Guaranteed Live Patch Wave

In local `infra/terraform/environments/dev/terraform.tfvars`, set:

```hcl
node_release_version      = "latest"
node_force_update_version = true
node_group_rotation_id    = "patch-001"
```

For repeated rehearsals, use a new ID each time, such as `patch-002` or `patch-003`.

Then run:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev fmt -recursive
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev plan
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev apply
```

In the plan, look for Terraform replacing the managed node group because `node_group_name` changes from:

```text
usfarcade-dev-primary
```

to:

```text
usfarcade-dev-patch-001
```

That replacement is the visible patch wave.

If you omit `node_group_rotation_id` and Terraform reports no changes, that means the node group is already on the latest recommended release. That is valid, but less useful for a live demo.

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

Terminal 4: watch managed node groups.

```bash
AWS_PROFILE=usfarcade aws eks list-nodegroups \
  --region us-east-1 \
  --cluster-name usfarcade-dev
```

Run that command a few times during the patch wave. You should see the new node group appear before the old one disappears.

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
- Terraform creates a fresh patched node group before removing the old one.
- Pods reschedule onto healthy nodes.
- PDBs prevent too many replicas from going down at once.
- The app keeps returning HTTP `200`.
- Grafana shows node/pod movement without service outage.

## After The Demo

Leave the new rotation ID in local `terraform.tfvars` after the apply completes:

```hcl
node_group_rotation_id = "patch-001"
```

Do not immediately change it back to `primary`, because that would trigger another node group replacement back to the old name. For the next patch wave, increment the ID instead.

## Presentation Line

```text
For OS patching, we do not SSH into nodes or click around the AWS Console. Terraform creates a fresh EKS managed node group using the desired AL2023 EKS optimized AMI release, then removes the old group. Kubernetes reschedules pods onto the new nodes, while our PDBs, readiness probes, replicas, and ALB health checks keep user traffic flowing.
```
