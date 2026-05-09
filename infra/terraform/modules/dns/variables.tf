variable "create_hosted_zone" {
  description = "Create a public Route53 hosted zone for the registered/root domain."
  type        = bool
  default     = false
}

variable "hosted_zone_name" {
  description = "Registered/root domain for the hosted zone, such as example.com."
  type        = string
  default     = null
}

variable "domain_name" {
  description = "Application DNS name, such as arcade.example.com."
  type        = string
}

variable "wait_for_certificate_validation" {
  description = "Wait for ACM certificate DNS validation. Set false for the first apply before external registrar nameservers are delegated."
  type        = bool
  default     = true
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for the parent domain."
  type        = string
  default     = null
}

variable "alb_dns_name" {
  description = "Optional ALB DNS name after the Kubernetes ingress creates it."
  type        = string
  default     = null
}

variable "alb_zone_id" {
  description = "Optional ALB hosted zone ID after the Kubernetes ingress creates it."
  type        = string
  default     = null
}

variable "tags" {
  type    = map(string)
  default = {}
}
