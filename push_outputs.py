import os
import subprocess

username = os.environ["GITHUB_USERNAME"]
token = os.environ["GITHUB_TOKEN"]
repo = "prophit"
branch = "main"

remote_url = f"https://{username}:{token}@github.com/{username}/{repo}.git"

subprocess.run(["git", "config", "--global", "user.email", "prophit-bot@example.com"], check=True)
subprocess.run(["git", "config", "--global", "user.name", "prophit-bot"], check=True)

subprocess.run(["git", "remote", "remove", "origin"], check=False)
subprocess.run(["git", "remote", "add", "origin", remote_url], check=True)

subprocess.run(["git", "add", "data/prophit_latest.json"], check=True)
subprocess.run(["git", "commit", "-m", "Auto-update PropHit data"], check=False)

subprocess.run(["git", "push", "origin", f"HEAD:{branch}"], check=True)

print("PropHit JSON pushed to GitHub")
