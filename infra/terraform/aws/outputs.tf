output "alb_dns_name" {
  description = "Public URL for dashboard and API routes."
  value       = aws_lb.main.dns_name
}

output "api_base_url" {
  description = "API base URL behind ALB."
  value       = "${local.app_url}/api"
}

output "dashboard_url" {
  description = "Dashboard URL behind ALB."
  value       = local.app_url
}

output "ecr_repositories" {
  description = "ECR repository URLs for pushing images."
  value = {
    api       = aws_ecr_repository.api.repository_url
    worker    = aws_ecr_repository.worker.repository_url
    dashboard = aws_ecr_repository.dashboard.repository_url
  }
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}
