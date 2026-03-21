import requests


def main() -> None:
    job_id = "67664154907"
    url = f"https://api.github.com/repos/ahmadrashad1/devops-automation/actions/jobs/{job_id}"
    response = requests.get(url, headers={"User-Agent": "devops-saas"}, timeout=30)
    response.raise_for_status()
    data = response.json()

    print(f"job={data.get('id')} conclusion={data.get('conclusion')}")
    for step in data.get("steps", []):
        print(f"{step.get('number')}: {step.get('name')} => {step.get('conclusion')}")


if __name__ == "__main__":
    main()

