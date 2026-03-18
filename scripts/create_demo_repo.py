import os
import subprocess
from pathlib import Path


def main() -> None:
    base = Path(r"D:/automations/devops-automation/test-repos/pipeline-demo")
    saas_dir = base / ".saas"
    saas_dir.mkdir(parents=True, exist_ok=True)

    yaml = """pipeline:
  stages: [build, test]

build:
  stage: build
  image: alpine:3.20
  script:
    - echo "build step"

test:
  stage: test
  image: alpine:3.20
  script:
    - echo "test step"
"""
    (saas_dir / "pipeline.yaml").write_text(yaml, encoding="utf-8")

    if not (base / ".git").exists():
        subprocess.check_call(["git", "-C", str(base), "init"])
        subprocess.check_call(["git", "-C", str(base), "config", "user.email", "devops@example.com"])
        subprocess.check_call(["git", "-C", str(base), "config", "user.name", "devops"])

    subprocess.check_call(["git", "-C", str(base), "add", "-A"])
    # If nothing changed, commit will fail; ignore in that case.
    try:
        subprocess.check_call(["git", "-C", str(base), "commit", "-m", "init pipeline", "-q"])
    except subprocess.CalledProcessError:
        pass

    sha = subprocess.check_output(["git", "-C", str(base), "rev-parse", "HEAD"], text=True).strip()
    print(sha)


if __name__ == "__main__":
    main()

