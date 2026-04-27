import os
import subprocess

username = os.environ["GITHUB_USERNAME"]
token = os.environ["GITHUB_TOKEN"]

repo = "prophit"
branch = "main"
remote_url = f"https://{username}:{token}@github.com/{username}/{repo}.git"

json_path = "public/data/prophit_latest.json"

def run(cmd, check=True):
    print("Running:", " ".join(cmd))
    return subprocess.run(cmd, check=check)

run(["git", "config", "--global", "user.email", "prophit-bot@example.com"])
run(["git", "config", "--global", "user.name", "prophit-bot"])

# Get latest main so Render is not stuck in detached HEAD
run(["git", "fetch", remote_url, branch])
run(["git", "checkout", "-B", branch, "FETCH_HEAD"])

# Add JSON
run(["git", "add", json_path])

# Commit only if file changed
result = subprocess.run(["git", "diff", "--cached", "--quiet"])
if result.returncode == 0:
    print("No JSON changes to commit.")
else:
    run(["git", "commit", "-m", "Auto-update PropHit data"])
    run(["git", "push", remote_url, branch])

print("PropHit JSON pushed to GitHub")
