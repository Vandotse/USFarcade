# Domain Delegation: Name.com to Route 53

Domain:

```text
evantestspa-demo.xyz
```

We are using Option A:

- domain stays registered at Name.com
- DNS is delegated to AWS Route 53
- Terraform creates the Route 53 hosted zone and ACM DNS validation records

## Flow

1. Terraform creates the Route 53 hosted zone.
2. Terraform outputs 4 Route 53 nameservers.
3. In Name.com, replace the domain nameservers with those 4 AWS nameservers.
4. Wait for DNS propagation.
5. Terraform can then validate ACM certificates and later manage app DNS records.

## Commands

After `terraform apply` creates the hosted zone:

```bash
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev output route53_name_servers
AWS_PROFILE=usfarcade terraform -chdir=infra/terraform/environments/dev output hosted_zone_id
```

Copy the 4 nameservers into Name.com.

## Name.com Steps

1. Log in to Name.com.
2. Go to **My Domains**.
3. Click `evantestspa-demo.xyz`.
4. Find **Nameservers**.
5. Choose the option to use custom nameservers.
6. Remove the existing Name.com nameservers.
7. Add the 4 AWS Route 53 nameservers from Terraform output.
8. Save.

Name.com’s official help page for changing nameservers is here:

```text
https://www.name.com/support/articles/205934497-changing-your-nameservers
```

## Important

Changing nameservers moves DNS authority for the whole domain to Route 53. If the domain has existing records you care about, recreate them in Route 53 before changing nameservers.

