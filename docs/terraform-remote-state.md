# Terraform Remote State

The grading rubric expects Terraform state to be managed properly. This project uses an S3 backend with DynamoDB locking:

- S3 stores versioned, encrypted Terraform state.
- DynamoDB prevents two Terraform runs from modifying the same state at once.
- The app environments keep separate state keys for `dev`, `uat`, and `prod`.

## 1. Bootstrap The State Backend

The backend has to exist before Terraform can use it. Run the bootstrap root once:

```bash
cd /Users/evanhaba/Desktop/CS486/USFarcade

cp infra/terraform/bootstrap/remote-state/terraform.tfvars.example \
  infra/terraform/bootstrap/remote-state/terraform.tfvars

AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/bootstrap/remote-state init
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/bootstrap/remote-state plan
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/bootstrap/remote-state apply
```

Expected outputs:

```text
state_bucket_name = "usfarcade-881933021016-us-east-1-tfstate"
lock_table_name   = "usfarcade-terraform-locks"
```

This bootstrap root intentionally starts with local state because the remote backend does not exist yet. The state bucket and lock table are protected with `prevent_destroy`.

## 2. Add Backend Config To Dev

Create this local file:

```text
infra/terraform/environments/dev/backend.tf
```

Use the bucket and lock table from bootstrap output:

```hcl
terraform {
  backend "s3" {
    bucket         = "usfarcade-881933021016-us-east-1-tfstate"
    key            = "usfarcade/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "usfarcade-terraform-locks"
    encrypt        = true
  }
}
```

Use different keys for later environments:

```text
usfarcade/uat/terraform.tfstate
usfarcade/prod/terraform.tfstate
```

## 3. Migrate Existing Dev State

Run:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev init -migrate-state
```

Terraform should ask whether to copy the existing local state to S3. Answer:

```text
yes
```

Then confirm the backend works:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev plan
```

Expected result:

```text
No changes. Your infrastructure matches the configuration.
```

## 4. Presentation Line

```text
Terraform state is stored remotely in an encrypted, versioned S3 bucket with DynamoDB locking. Each environment has a separate state key, so dev, UAT, and prod cannot overwrite each other. This prevents local laptop state loss and prevents two operators or CI jobs from applying conflicting changes at the same time.
```
