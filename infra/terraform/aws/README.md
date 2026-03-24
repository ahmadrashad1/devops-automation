# Terraform AWS target (ECS Fargate)

This stack provisions AWS infrastructure for:

- VPC + 2 public subnets
- ALB with routing:
  - `/api/*` -> API service
  - `/` -> dashboard service
- ECS cluster + Fargate services:
  - API
  - dashboard
  - worker
- AWS Secrets Manager for runtime secrets (`DATABASE_URL`, `REDIS_URL`, AI keys)
- ECS autoscaling policies (API + dashboard)
- CloudWatch alarms + SNS topic (optional email subscription)
- CloudWatch logs
- ECR repositories for all three images

## Prerequisites

- Terraform `>= 1.6`
- AWS credentials configured (`aws configure` or environment variables)
- Images built and pushed to ECR (or another registry)
- Existing Postgres + Redis endpoints (RDS/ElastiCache/external)

## Usage

From repo root:

```powershell
pnpm tf:aws:init
copy infra/terraform/aws/terraform.tfvars.example infra/terraform/aws/terraform.tfvars
pnpm tf:aws:plan
pnpm tf:aws:apply
```

Destroy:

```powershell
pnpm tf:aws:destroy
```

## Important notes

- This is a production-oriented baseline and now injects sensitive values through Secrets Manager into ECS task definitions.
- To enable HTTPS, set `enable_https=true` and provide `acm_certificate_arn`.
- To map a domain, set `enable_route53_alias=true`, `route53_zone_id`, and `domain_name`.
- If you set `alert_email`, AWS will send a confirmation email for SNS subscription.
- `terraform.tfvars` should never be committed.
