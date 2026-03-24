variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Resource name prefix."
  type        = string
  default     = "devops-automation"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Two public subnet CIDRs for ALB and Fargate."
  type        = list(string)
  default     = ["10.20.1.0/24", "10.20.2.0/24"]
}

variable "api_port" {
  description = "API container port."
  type        = number
  default     = 3010
}

variable "dashboard_port" {
  description = "Dashboard container port."
  type        = number
  default     = 3001
}

variable "api_cpu" {
  description = "Fargate CPU units for API."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate memory (MB) for API."
  type        = number
  default     = 1024
}

variable "dashboard_cpu" {
  description = "Fargate CPU units for dashboard."
  type        = number
  default     = 512
}

variable "dashboard_memory" {
  description = "Fargate memory (MB) for dashboard."
  type        = number
  default     = 1024
}

variable "worker_cpu" {
  description = "Fargate CPU units for worker."
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Fargate memory (MB) for worker."
  type        = number
  default     = 1024
}

variable "api_image" {
  description = "Full API image URI (for example, ECR repo URL + tag)."
  type        = string
}

variable "dashboard_image" {
  description = "Full dashboard image URI."
  type        = string
}

variable "worker_image" {
  description = "Full worker image URI."
  type        = string
}

variable "database_url" {
  description = "Postgres connection string used by API."
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Redis connection string used by API and worker."
  type        = string
  sensitive   = true
}

variable "job_queue_name" {
  description = "BullMQ queue name."
  type        = string
  default     = "jobs"
}

variable "ai_provider" {
  description = "Optional forced AI provider."
  type        = string
  default     = ""
}

variable "groq_api_key" {
  description = "Groq API key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "groq_model" {
  description = "Groq model."
  type        = string
  default     = "llama-3.1-8b-instant"
}

variable "gemini_api_key" {
  description = "Gemini API key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gemini_model" {
  description = "Gemini model."
  type        = string
  default     = "gemini-2.0-flash"
}

variable "openai_api_key" {
  description = "OpenAI API key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "openai_model" {
  description = "OpenAI model."
  type        = string
  default     = "gpt-4o-mini"
}

variable "api_desired_count" {
  description = "Desired task count for API service."
  type        = number
  default     = 1
}

variable "dashboard_desired_count" {
  description = "Desired task count for dashboard service."
  type        = number
  default     = 1
}

variable "worker_desired_count" {
  description = "Desired task count for worker service."
  type        = number
  default     = 1
}

variable "enable_https" {
  description = "Enable HTTPS listener on ALB (requires acm_certificate_arn)."
  type        = bool
  default     = false
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS listener."
  type        = string
  default     = ""
}

variable "enable_route53_alias" {
  description = "Create Route53 ALIAS record to ALB."
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for alias record."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Domain name to point to ALB (for example app.example.com)."
  type        = string
  default     = ""
}

variable "enable_autoscaling" {
  description = "Enable ECS service autoscaling for API and dashboard."
  type        = bool
  default     = true
}

variable "api_min_count" {
  description = "Minimum API tasks when autoscaling is enabled."
  type        = number
  default     = 1
}

variable "api_max_count" {
  description = "Maximum API tasks when autoscaling is enabled."
  type        = number
  default     = 4
}

variable "dashboard_min_count" {
  description = "Minimum dashboard tasks when autoscaling is enabled."
  type        = number
  default     = 1
}

variable "dashboard_max_count" {
  description = "Maximum dashboard tasks when autoscaling is enabled."
  type        = number
  default     = 3
}

variable "autoscaling_cpu_target" {
  description = "Target average CPU utilization percentage for autoscaling."
  type        = number
  default     = 60
}

variable "enable_alarms" {
  description = "Enable CloudWatch alarms and SNS topic."
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Optional email endpoint for alarm notifications."
  type        = string
  default     = ""
}
