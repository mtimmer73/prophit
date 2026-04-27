import pandas as pd
import numpy as np
import json

# CHANGE THIS to your actual file name
INPUT_FILE = "justin_model.xlsx"
OUTPUT_FILE = "justin_model_clean.json"

# Load file
if INPUT_FILE.endswith(".xlsx"):
    df = pd.read_excel(INPUT_FILE)
else:
    df = pd.read_csv(INPUT_FILE)

# Clean bad JSON values
df = df.replace([np.inf, -np.inf], np.nan)
df = df.where(pd.notnull(df), None)

# Export clean JSON
records = df.to_dict(orient="records")

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(records, f, indent=2)

print("✅ JSON cleaned and saved:", OUTPUT_FILE)