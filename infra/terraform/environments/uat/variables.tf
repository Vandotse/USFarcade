variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "uat"
}

variable "project" {
  type    = string
  default = "usfarcade"
}

variable "vpc_cidr" {
  type    = string
  default = "10.50.0.0/16"
}

variable "az_count" {
  type    = number
  default = 2
}

variable "kubernetes_version" {
  type    = string
  default = "1.30"
}

variable "create_iam_roles" {
  type    = bool
  default = true
}

variable "cluster_role_arn" {
  type    = string
  default = null
}

variable "node_role_arn" {
  type    = string
  default = null
}

variable "node_instance_types" {
  type    = list(string)
  default = ["t3.medium"]
}

variable "node_desired_size" {
  type    = number
  default = 3
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 5
}

variable "rds_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "enable_dns" {
  type    = bool
  default = false
}

variable "create_hosted_zone" {
  type    = bool
  default = false
}

variable "hosted_zone_name" {
  type    = string
  default = null
}

variable "domain_name" {
  type    = string
  default = null
}

variable "wait_for_certificate_validation" {
  type    = bool
  default = true
}

variable "hosted_zone_id" {
  type    = string
  default = null
}

variable "alb_dns_name" {
  type    = string
  default = null
}

variable "alb_zone_id" {
  type    = string
  default = null
}
