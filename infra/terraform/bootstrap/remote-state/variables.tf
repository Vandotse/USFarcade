variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "usfarcade"
}

variable "state_bucket_name" {
  description = "Optional explicit S3 bucket name for Terraform state. Leave null to derive one from project, account ID, and region."
  type        = string
  default     = null
}

variable "lock_table_name" {
  description = "DynamoDB table used by Terraform for state locking."
  type        = string
  default     = "usfarcade-terraform-locks"
}

variable "force_destroy_state_bucket" {
  description = "Keep false for real use so Terraform state cannot be accidentally deleted while objects exist."
  type        = bool
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
