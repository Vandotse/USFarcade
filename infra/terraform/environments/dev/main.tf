locals {
  name = "${var.project}-${var.environment}"

  services = toset([
    "frontend",
    "player-service",
    "game-service",
    "score-service",
    "leaderboard-service"
  ])

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  eks_oidc_provider = replace(module.eks.oidc_issuer_url, "https://", "")
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

  name                = local.name
  kubernetes_version  = var.kubernetes_version
  vpc_id              = module.network.vpc_id
  private_subnet_ids  = module.network.private_subnet_ids
  create_iam_roles    = var.create_iam_roles
  cluster_role_arn    = var.cluster_role_arn
  node_role_arn       = var.node_role_arn
  node_instance_types = var.node_instance_types
  node_desired_size   = var.node_desired_size
  node_min_size       = var.node_min_size
  node_max_size       = var.node_max_size
  tags                = local.tags
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

module "grafana_dns" {
  count  = var.enable_dns && var.grafana_domain_name != null ? 1 : 0
  source = "../../modules/dns"

  create_hosted_zone              = false
  hosted_zone_name                = var.hosted_zone_name
  domain_name                     = var.grafana_domain_name
  wait_for_certificate_validation = var.wait_for_certificate_validation
  hosted_zone_id                  = var.enable_dns ? module.dns[0].hosted_zone_id : var.hosted_zone_id
  alb_dns_name                    = var.grafana_alb_dns_name
  alb_zone_id                     = var.grafana_alb_zone_id
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

data "tls_certificate" "eks_oidc" {
  url = module.eks.oidc_issuer_url
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks_oidc.certificates[0].sha1_fingerprint]
  url             = module.eks.oidc_issuer_url

  tags = local.tags
}

resource "aws_iam_policy" "aws_load_balancer_controller" {
  name        = "${local.name}-aws-load-balancer-controller"
  description = "IAM permissions for the AWS Load Balancer Controller running in EKS."
  policy      = file("${path.module}/../../modules/eks/aws-load-balancer-controller-iam-policy.json")

  tags = local.tags
}

resource "aws_iam_role" "aws_load_balancer_controller" {
  name = "${local.name}-aws-load-balancer-controller"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.eks_oidc_provider}:aud" = "sts.amazonaws.com"
          "${local.eks_oidc_provider}:sub" = "system:serviceaccount:kube-system:aws-load-balancer-controller"
        }
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "aws_load_balancer_controller" {
  role       = aws_iam_role.aws_load_balancer_controller.name
  policy_arn = aws_iam_policy.aws_load_balancer_controller.arn
}

resource "kubernetes_service_account" "aws_load_balancer_controller" {
  metadata {
    name      = "aws-load-balancer-controller"
    namespace = "kube-system"
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.aws_load_balancer_controller.arn
    }
    labels = {
      "app.kubernetes.io/name" = "aws-load-balancer-controller"
    }
  }
}

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = "1.8.1"
  namespace  = "kube-system"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "region"
    value = var.aws_region
  }

  set {
    name  = "vpcId"
    value = module.network.vpc_id
  }

  set {
    name  = "serviceAccount.create"
    value = "false"
  }

  set {
    name  = "serviceAccount.name"
    value = kubernetes_service_account.aws_load_balancer_controller.metadata[0].name
  }

  depends_on = [
    aws_iam_role_policy_attachment.aws_load_balancer_controller,
    kubernetes_service_account.aws_load_balancer_controller
  ]
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1"
  ]
  url = "https://token.actions.githubusercontent.com"

  tags = local.tags
}

resource "aws_iam_role" "github_actions_deploy" {
  name = "${local.name}-github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github_actions.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = [
            "repo:${var.github_repository}:ref:refs/heads/main",
            "repo:${var.github_repository}:ref:refs/tags/v*",
            "repo:${var.github_repository}:pull_request",
            "repo:${var.github_repository}:environment:dev",
            "repo:${var.github_repository}:environment:uat",
            "repo:${var.github_repository}:environment:production"
          ]
        }
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_policy" "github_actions_deploy" {
  name        = "${local.name}-github-actions-deploy"
  description = "Permissions for GitHub Actions to push ECR images and deploy to EKS."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:DescribeRepositories",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:ListImages",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = [for repo in aws_ecr_repository.services : repo.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster"
        ]
        Resource = "arn:aws:eks:${var.aws_region}:*:cluster/${var.project}-*"
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "github_actions_deploy" {
  role       = aws_iam_role.github_actions_deploy.name
  policy_arn = aws_iam_policy.github_actions_deploy.arn
}

resource "kubernetes_config_map_v1_data" "aws_auth" {
  metadata {
    name      = "aws-auth"
    namespace = "kube-system"
  }

  data = {
    mapRoles = yamlencode([
      {
        rolearn  = module.eks.node_role_arn
        username = "system:node:{{EC2PrivateDNSName}}"
        groups = [
          "system:bootstrappers",
          "system:nodes"
        ]
      },
      {
        rolearn  = aws_iam_role.github_actions_deploy.arn
        username = "github-actions"
        groups = [
          "system:masters"
        ]
      }
    ])
  }

  force = true

  depends_on = [
    module.eks,
    aws_iam_role.github_actions_deploy
  ]
}

resource "aws_ecr_repository" "services" {
  for_each = local.services

  name                 = "${var.project}/${each.value}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(local.tags, {
    Service = each.value
  })
}

resource "aws_ecr_lifecycle_policy" "services" {
  for_each = aws_ecr_repository.services

  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 15 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 15
      }
      action = {
        type = "expire"
      }
    }]
  })
}
