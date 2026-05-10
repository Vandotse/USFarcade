locals {
  name = "${var.project}-${var.environment}"

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

module "network" {
  source = "../../modules/network"

  name         = local.name
  cluster_name = local.name
  vpc_cidr     = var.vpc_cidr
  az_count     = var.az_count
  tags         = local.tags
}

module "eks" {
  source = "../../modules/eks"

  name                      = local.name
  kubernetes_version        = var.kubernetes_version
  vpc_id                    = module.network.vpc_id
  private_subnet_ids        = module.network.private_subnet_ids
  create_iam_roles          = var.create_iam_roles
  cluster_role_arn          = var.cluster_role_arn
  node_role_arn             = var.node_role_arn
  node_instance_types       = var.node_instance_types
  node_desired_size         = var.node_desired_size
  node_min_size             = var.node_min_size
  node_max_size             = var.node_max_size
  node_release_version      = var.node_release_version
  node_force_update_version = var.node_force_update_version
  node_group_rotation_id    = var.node_group_rotation_id
  tags                      = local.tags
}

module "rds" {
  source = "../../modules/rds"

  name                       = local.name
  vpc_id                     = module.network.vpc_id
  private_subnet_ids         = module.network.private_subnet_ids
  allowed_security_group_ids = [module.eks.cluster_security_group_id]
  instance_class             = var.rds_instance_class
  tags                       = local.tags
}

module "dns" {
  count  = var.enable_dns ? 1 : 0
  source = "../../modules/dns"

  create_hosted_zone              = var.create_hosted_zone
  hosted_zone_name                = var.hosted_zone_name
  domain_name                     = var.domain_name
  wait_for_certificate_validation = var.wait_for_certificate_validation
  hosted_zone_id                  = var.hosted_zone_id
  alb_dns_name                    = var.alb_dns_name
  alb_zone_id                     = var.alb_zone_id
  tags                            = local.tags
}

resource "kubernetes_namespace" "app" {
  metadata {
    name = "usfarcade"
  }

  depends_on = [module.eks]
}

resource "kubernetes_secret" "db" {
  metadata {
    name      = "usfarcade-db"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  data = {
    DATABASE_URL = module.rds.database_url
  }

  type = "Opaque"
}
