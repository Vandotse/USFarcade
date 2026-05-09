# Terraform

This directory manages AWS infrastructure for ByteBattle Arena:

- VPC with public/private subnets
- EKS managed node group
- RDS PostgreSQL
- Route53 DNS validation and ACM certificates
- Kubernetes namespace and RDS connection secret

## Environments

Each environment has its own Terraform root:

```text
infra/terraform/environments/dev
infra/terraform/environments/uat
infra/terraform/environments/prod
```

Use the matching `terraform.tfvars.example` as the starting point:

```bash
cd infra/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
```

## AWS Academy Warning

AWS Academy accounts often have restrictions around IAM, service quotas, session duration, and allowed regions. Before running `terraform apply`, confirm:

- the active AWS region
- whether IAM role creation is allowed
- whether EKS is enabled in the account
- whether `t3.medium` and `db.t3.micro` are allowed
- whether Route53 hosted zones are available

If IAM role creation is blocked, set:

```hcl
create_iam_roles = false
cluster_role_arn = "arn:aws:iam::ACCOUNT_ID:role/ROLE_FROM_NADI"
node_role_arn    = "arn:aws:iam::ACCOUNT_ID:role/ROLE_FROM_NADI"
```

## State

For grading, remote state should be used rather than local state. Use `backend.s3.tf.example` as the template after Nadi provides:

- S3 bucket name for state
- DynamoDB lock table name
- AWS region

Copy it into the environment directory as `backend.tf` and change the `key` per environment:

```text
usfarcade/dev/terraform.tfstate
usfarcade/uat/terraform.tfstate
usfarcade/prod/terraform.tfstate
```

## Day 1 Flow

```bash
terraform init
terraform fmt -recursive
terraform validate
terraform plan
terraform apply
```

After the cluster exists:

```bash
aws eks update-kubeconfig --region us-east-1 --name usfarcade-dev
kubectl apply -k ../../../k8s/overlays/dev
```

## Day 2 OS Patching

EKS managed node group patching is Terraform-driven:

```bash
terraform plan
terraform apply
```

The node group has:

- managed AL2023 EKS AMIs
- `max_unavailable = 1`
- app PodDisruptionBudgets
- 3 replicas for each service

That lets Kubernetes drain and replace one node at a time while keeping service endpoints available.

