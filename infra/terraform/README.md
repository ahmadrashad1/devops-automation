# Terraform (Docker-based local infra)

This Terraform setup provisions the same local stack you already run with Compose:

- Postgres (`postgres:16-alpine`)
- Redis (`redis:7-alpine`)
- Optional full app stack: API + worker + dashboard (built from this repo's Dockerfiles)

## Prerequisites

- Terraform `>= 1.6`
- Docker Desktop running

## Quick start

From repo root:

```powershell
pnpm tf:init
copy infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
pnpm tf:plan
pnpm tf:apply
```

Destroy everything:

```powershell
pnpm tf:destroy
```

## Notes

- `terraform.tfvars` is intentionally ignored in git; keep your real AI keys there.
- `mount_docker_socket` defaults to `false` because Windows setups vary. Set it to `true` only if your Docker socket path is available from containers.
- If port conflicts happen, change host ports in `terraform.tfvars`.
