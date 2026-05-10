variable "name" {
  description = "EKS cluster name."
  type        = string
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version."
  type        = string
  default     = "1.30"
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for EKS control plane and node groups."
  type        = list(string)
}

variable "create_iam_roles" {
  description = "Create EKS IAM roles. Set false in restricted AWS Academy accounts and provide existing role ARNs."
  type        = bool
  default     = true
}

variable "cluster_role_arn" {
  description = "Existing EKS cluster role ARN when create_iam_roles is false."
  type        = string
  default     = null
}

variable "node_role_arn" {
  description = "Existing EKS node role ARN when create_iam_roles is false."
  type        = string
  default     = null
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group."
  type        = list(string)
  default     = ["t3.medium"]
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

variable "node_release_version" {
  description = "EKS optimized AMI release version for the managed node group. Set to latest to read the current AL2023 recommendation from SSM, set an explicit release version to pin, or leave null to let EKS choose."
  type        = string
  default     = null
}

variable "node_force_update_version" {
  description = "Force a managed node group version update even if pods cannot drain cleanly. Keep false normally; use true for controlled Day 2 patch demos if needed."
  type        = bool
  default     = false
}

variable "node_group_rotation_id" {
  description = "Stable suffix for the managed node group name. Change this value, for example from primary to patch-001, to force a create-before-destroy node group rotation for a Day 2 patch wave."
  type        = string
  default     = "primary"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{0,31}$", var.node_group_rotation_id))
    error_message = "node_group_rotation_id must be 1-32 lowercase letters, numbers, or hyphens, and must start with a letter or number."
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}
