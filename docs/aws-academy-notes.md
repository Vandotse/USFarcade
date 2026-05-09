# AWS Academy Notes

Before we apply Terraform, we need these account details from Nadi or the instructor:

- AWS account ID
- AWS region we are allowed to use, likely `us-east-1`
- whether EKS is enabled and allowed
- whether Terraform may create IAM roles
- if IAM creation is blocked, the cluster and node IAM role ARNs to use
- Route53 hosted zone ID, if DNS is part of this AWS account
- custom domain or subdomain to use for the app
- whether the account has service quotas for at least:
  - 1 VPC
  - 1 NAT gateway
  - 1 EKS cluster
  - 3 `t3.medium` worker nodes
  - 1 RDS PostgreSQL instance

## Expected Academy Friction

AWS Academy sessions may expire. If Terraform loses credentials mid-apply, rerun `terraform plan` before retrying so we can see what was created.

IAM may be restricted. The Terraform modules support `create_iam_roles = false`, but EKS still needs valid role ARNs.

NAT gateways cost money. If the Academy budget is tight, we can revise the network module to avoid NAT and put nodes in public subnets for the class demo, but the current design is cleaner and more production-like.

Route53 may not be available. If the custom domain lives outside AWS, we can still create ACM DNS validation records as Terraform output and have the DNS owner add them.

