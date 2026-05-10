output "cluster_name" {
  value = module.eks.cluster_name
}

output "node_group_name" {
  value = module.eks.node_group_name
}

output "node_group_release_version" {
  value = module.eks.node_group_release_version
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "database_url" {
  value     = module.rds.database_url
  sensitive = true
}

output "certificate_arn" {
  value = var.enable_dns ? module.dns[0].certificate_arn : null
}

output "grafana_certificate_arn" {
  value = var.enable_dns && var.grafana_domain_name != null ? module.grafana_dns[0].certificate_arn : null
}

output "hosted_zone_id" {
  value = var.enable_dns ? module.dns[0].hosted_zone_id : null
}

output "route53_name_servers" {
  value = var.enable_dns ? module.dns[0].name_servers : []
}

output "ecr_repository_urls" {
  value = {
    for name, repo in aws_ecr_repository.services : name => repo.repository_url
  }
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions_deploy.arn
}

output "ebs_csi_driver_role_arn" {
  value = aws_iam_role.ebs_csi_driver.arn
}
