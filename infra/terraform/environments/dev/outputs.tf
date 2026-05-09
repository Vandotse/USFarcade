output "cluster_name" {
  value = module.eks.cluster_name
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
