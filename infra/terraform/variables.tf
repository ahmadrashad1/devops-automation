variable "project_name" {
  description = "Prefix used for Docker resources."
  type        = string
  default     = "devops-automation"
}

variable "enable_full_stack" {
  description = "When true, also run API, worker, and dashboard containers."
  type        = bool
  default     = true
}

variable "api_host_port" {
  description = "Host port mapped to API container port 3010."
  type        = number
  default     = 3010
}

variable "dashboard_host_port" {
  description = "Host port mapped to dashboard container port 3001."
  type        = number
  default     = 3001
}

variable "postgres_host_port" {
  description = "Host port mapped to Postgres container port 5432."
  type        = number
  default     = 5432
}

variable "redis_host_port" {
  description = "Host port mapped to Redis container port 6379."
  type        = number
  default     = 6379
}

variable "api_public_url" {
  description = "Public API URL used by the dashboard build arg."
  type        = string
  default     = "http://localhost:3010"
}

variable "dashboard_origin" {
  description = "Allowed CORS origin(s) for API."
  type        = string
  default     = "http://localhost:3001"
}

variable "job_queue_name" {
  description = "BullMQ queue name."
  type        = string
  default     = "jobs"
}

variable "groq_api_key" {
  description = "Groq API key for AI features."
  type        = string
  default     = ""
  sensitive   = true
}

variable "groq_model" {
  description = "Groq model ID."
  type        = string
  default     = "llama-3.1-8b-instant"
}

variable "gemini_api_key" {
  description = "Gemini API key (optional)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gemini_model" {
  description = "Gemini model ID."
  type        = string
  default     = "gemini-2.0-flash"
}

variable "openai_api_key" {
  description = "OpenAI API key (optional)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "openai_model" {
  description = "OpenAI model ID."
  type        = string
  default     = "gpt-4o-mini"
}

variable "ai_provider" {
  description = "Optional forced AI provider: groq | gemini | openai."
  type        = string
  default     = ""
}

variable "mount_docker_socket" {
  description = "Mount /var/run/docker.sock into worker. Keep false on Windows unless your Docker setup supports it."
  type        = bool
  default     = false
}
