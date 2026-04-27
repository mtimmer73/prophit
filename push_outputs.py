import subprocess

subprocess.run(["git", "config", "--global", "user.email", "prophit-bot@auto.com"])
subprocess.run(["git", "config", "--global", "user.name", "prophit-bot"])

subprocess.run(["git", "add", "proppulse-ui-app/public/data/prophit_latest.json"])
subprocess.run(["git", "commit", "-m", "auto update"])
subprocess.run(["git", "push"])