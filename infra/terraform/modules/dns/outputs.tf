output "certificate_arn" {
  value = var.wait_for_certificate_validation ? aws_acm_certificate_validation.this[0].certificate_arn : aws_acm_certificate.this.arn
}

output "hosted_zone_id" {
  value = local.zone_id
}

output "name_servers" {
  value = var.create_hosted_zone ? aws_route53_zone.this[0].name_servers : []
}
