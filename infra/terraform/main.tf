locals {
  repo_root = abspath("${path.module}/../..")
}

resource "docker_network" "app" {
  name = "${var.project_name}-net"
}

resource "docker_volume" "pgdata" {
  name = "${var.project_name}-pgdata"
}

resource "docker_container" "postgres" {
  name  = "${var.project_name}-postgres"
  image = "postgres:16-alpine"

  restart = "unless-stopped"

  env = [
    "POSTGRES_USER=devops",
    "POSTGRES_PASSWORD=devops",
    "POSTGRES_DB=devops_automation"
  ]

  ports {
    internal = 5432
    external = var.postgres_host_port
  }

  mounts {
    target = "/var/lib/postgresql/data"
    type   = "volume"
    source = docker_volume.pgdata.name
  }

  networks_advanced {
    name = docker_network.app.name
  }
}

resource "docker_container" "redis" {
  name  = "${var.project_name}-redis"
  image = "redis:7-alpine"

  restart = "unless-stopped"

  ports {
    internal = 6379
    external = var.redis_host_port
  }

  networks_advanced {
    name = docker_network.app.name
  }
}

resource "docker_image" "api" {
  count = var.enable_full_stack ? 1 : 0
  name  = "${var.project_name}/api:local"

  build {
    context    = local.repo_root
    dockerfile = "infra/docker/api.Dockerfile"
  }
}

resource "docker_container" "api" {
  count = var.enable_full_stack ? 1 : 0
  name  = "${var.project_name}-api"
  image = docker_image.api[0].image_id

  restart = "unless-stopped"
  wait    = true

  env = [
    "PORT=3010",
    "NODE_ENV=production",
    "DATABASE_URL=postgresql://devops:devops@${docker_container.postgres.name}:5432/devops_automation",
    "REDIS_URL=redis://${docker_container.redis.name}:6379",
    "JOB_QUEUE_NAME=${var.job_queue_name}",
    "DASHBOARD_ORIGIN=${var.dashboard_origin}",
    "AI_PROVIDER=${var.ai_provider}",
    "GROQ_API_KEY=${var.groq_api_key}",
    "GROQ_MODEL=${var.groq_model}",
    "GEMINI_API_KEY=${var.gemini_api_key}",
    "GEMINI_MODEL=${var.gemini_model}",
    "OPENAI_API_KEY=${var.openai_api_key}",
    "OPENAI_MODEL=${var.openai_model}"
  ]

  ports {
    internal = 3010
    external = var.api_host_port
  }

  networks_advanced {
    name = docker_network.app.name
  }

  depends_on = [docker_container.postgres, docker_container.redis]
}

resource "docker_image" "worker" {
  count = var.enable_full_stack ? 1 : 0
  name  = "${var.project_name}/worker:local"

  build {
    context    = local.repo_root
    dockerfile = "infra/docker/worker.Dockerfile"
  }
}

resource "docker_container" "worker" {
  count = var.enable_full_stack ? 1 : 0
  name  = "${var.project_name}-worker"
  image = docker_image.worker[0].image_id

  restart = "unless-stopped"

  env = [
    "NODE_ENV=production",
    "JOB_QUEUE_NAME=${var.job_queue_name}",
    "REDIS_URL=redis://${docker_container.redis.name}:6379",
    "API_BASE_URL=http://${docker_container.api[0].name}:3010"
  ]

  dynamic "mounts" {
    for_each = var.mount_docker_socket ? [1] : []
    content {
      type   = "bind"
      source = "/var/run/docker.sock"
      target = "/var/run/docker.sock"
    }
  }

  networks_advanced {
    name = docker_network.app.name
  }

  depends_on = [docker_container.redis, docker_container.api]
}

resource "docker_image" "dashboard" {
  count = var.enable_full_stack ? 1 : 0
  name  = "${var.project_name}/dashboard:local"

  build {
    context    = local.repo_root
    dockerfile = "infra/docker/dashboard.Dockerfile"

    build_args = {
      NEXT_PUBLIC_API_URL = var.api_public_url
    }
  }
}

resource "docker_container" "dashboard" {
  count = var.enable_full_stack ? 1 : 0
  name  = "${var.project_name}-dashboard"
  image = docker_image.dashboard[0].image_id

  restart = "unless-stopped"

  env = [
    "PORT=3001",
    "NODE_ENV=production"
  ]

  ports {
    internal = 3001
    external = var.dashboard_host_port
  }

  networks_advanced {
    name = docker_network.app.name
  }

  depends_on = [docker_container.api]
}
