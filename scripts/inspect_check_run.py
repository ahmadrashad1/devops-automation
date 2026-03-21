import requests
import json


def main() -> None:
    ref = "21c8396b5036ff06466df0c27021a1cc0dbde2e5"
    url = f"https://api.github.com/repos/ahmadrashad1/devops-automation/commits/{ref}/check-runs"
    headers = {
        "User-Agent": "devops-saas",
        "Accept": "application/vnd.github+json",
    }
    data = requests.get(url, headers=headers, timeout=30).json()
    for run in data.get("check_runs", []):
        print("name:", run.get("name"))
        print("status:", run.get("status"), "conclusion:", run.get("conclusion"))
        output = run.get("output") or {}
        print("title:", output.get("title"))
        print("summary:", output.get("summary"))
        text = output.get("text")
        if text:
            print("text:", text[:2000])
        print("-" * 40)


if __name__ == "__main__":
    main()

