import os
import pandas as pd
import joblib

model_dir = os.path.join("backend", "models", "decision_tree_v2")
water_need_pipe = joblib.load(os.path.join(model_dir, "water_need_pipeline.joblib"))

# Input with N=90, P=42, K=43 (HARDCODED FRONTEND STATE)
input_hardcoded = pd.DataFrame([{
    "crop": "rice",
    "N": 90,
    "P": 42,
    "K": 43,
    "temperature": 25.0756354,
    "humidity": 80.52389,
    "ph": 7.778915,
    "rainfall": 257.0039,
    "Soil Moisture": 47.6
}])

# Input with N=66, P=53, K=41 (USER'S ACTUAL TEST CASE)
input_user = pd.DataFrame([{
    "crop": "rice",
    "N": 66,
    "P": 53,
    "K": 41,
    "temperature": 25.0756354,
    "humidity": 80.52389,
    "ph": 7.778915,
    "rainfall": 257.0039,
    "Soil Moisture": 47.6
}])

pred_hardcoded = water_need_pipe.predict(input_hardcoded)[0]
proba_hardcoded = water_need_pipe.predict_proba(input_hardcoded)[0]

pred_user = water_need_pipe.predict(input_user)[0]
proba_user = water_need_pipe.predict_proba(input_user)[0]

print("=== N=90, P=42, K=43 (HARDCODED DEFAULTS) ===")
print(f"Prediction: '{pred_hardcoded}'")
print(f"Probabilities: {dict(zip(water_need_pipe.classes_, proba_hardcoded))}")

print("\n=== N=66, P=53, K=41 (USER'S EXACT TEST CASE) ===")
print(f"Prediction: '{pred_user}'")
print(f"Probabilities: {dict(zip(water_need_pipe.classes_, proba_user))}")
