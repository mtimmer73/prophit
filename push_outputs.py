import os
import subprocess

username = os.environ["GITHUB_USERNAME"]
token = os.environ["GITHUB_TOKEN"]

repo = "prophit"
branch = "main"

remote_url = f"https://{username}:{token}@github.com/{username}/{repo}.git"

# Set git identity
subprocess.run(["git", "config", "--global", "user.email", "prophit-bot@example.com"], check=True)
subprocess.run(["git", "config", "--global", "user.name", "prophit-bot"], check=True)

# Add remote using token URL (force overwrite if exists)
subprocess.run(["git", "remote", "remove", "origin"], check=False)
subprocess.run(["git", "remote", "add", "origin", remote_url], check=True)

# Add + commit file
subprocess.run(["git", "add", "data/prophit_latest.json"], check=True)
subprocess.run(["git", "commit", "-m", "Auto-update PropHit data"], check=False)

# 🔥 THIS IS THE FIX (direct push via URL)
subprocess.run(["git", "push", remote_url, f"HEAD:{branch}"], check=True)

print("PropHit JSON pushed to GitHub")
