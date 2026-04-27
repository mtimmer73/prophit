import pandas as pd
import numpy as np
import json

# === CHANGE THIS TO YOUR INPUT FILE ===
INPUT_FILE = "consensus_raw.csv"   # or .xlsx
OUTPUT_FILE = "consensus_clean.json"

# Load data
if INPUT_FILE.endswith(".csv"):
    df = pd.read_csv(INPUT_FILE)
else:
    df = pd.read_excel(INPUT_FILE)

# Clean invalid JSON values
df = df.replace([np.inf, -np.inf], np.nan)
df = df.where(pd.notnull(df), None)

# Convert to records
records = df.to_dict(orient="records")

# Write valid JSON
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(records, f, indent=2)

print(f"Clean JSON saved to {OUTPUT_FILE}")
