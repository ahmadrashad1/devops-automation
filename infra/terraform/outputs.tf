output "postgres_url" {
  value = "postgresql://devops:devops@localhost:${var.postgres_host_port}/devops_automation"
}

output "redis_url" {
  value = "redis://localhost:${var.redis_host_port}"
}

output "api_url" {
  value = var.enable_full_stack ? "http://localhost:${var.api_host_port}" : null
}

output "dashboard_url" {
  value = var.enable_full_stack ? "http://localhost:${var.dashboard_host_port}" : null
}
