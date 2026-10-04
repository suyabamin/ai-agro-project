import os
import pandas as pd
import joblib
import json

# 1. Load Dataset
dataset_path = os.path.join("backend", "data", "agroai_labeled_dataset_v2.csv")
df = pd.read_csv(dataset_path)

print("=== STEP 7: SEARCH DATASET FOR ROW ===")
matching_rows = df[
    (df["N"] == 66) &
    (df["P"] == 53) &
    (df["K"] == 41) &
    (df["label"].str.lower() == "rice")
]

print(f"Total matching N=66, P=53, K=41, label=rice rows: {len(matching_rows)}")
for idx, row in matching_rows.iterrows():
    print(f"Row Index: {idx}")
    print(f"  N={row['N']}, P={row['P']}, K={row['K']}, label/crop={row['label']}")
    print(f"  temp={row['temperature']}, hum={row['humidity']}, ph={row['ph']}, rain={row['rainfall']}")
    print(f"  Soil Moisture={row['Soil Moisture']}")
    print(f"  Water Need (dataset label) = '{row['Water Need']}'")
    print(f"  Status (dataset label) = '{row['Status']}'")
    print(f"  label_source = '{row.get('label_source', 'N/A')}', label_method = '{row.get('label_method', 'N/A')}'")

# 2. Check Model Files
model_dir = os.path.join("backend", "models", "decision_tree_v2")
print("\n=== STEP 5: VERIFY LOADED MODEL FILES ===")
print(f"Model dir: {os.path.abspath(model_dir)}")
print(f"water_need_pipeline exists: {os.path.exists(os.path.join(model_dir, 'water_need_pipeline.joblib'))}")
print(f"status_pipeline exists: {os.path.exists(os.path.join(model_dir, 'status_pipeline.joblib'))}")

if os.path.exists(os.path.join(model_dir, "metadata.json")):
    with open(os.path.join(model_dir, "metadata.json")) as f:
        meta = json.load(f)
        print("Metadata:", json.dumps(meta, indent=2))

if os.path.exists(os.path.join(model_dir, "feature_info.json")):
    with open(os.path.join(model_dir, "feature_info.json")) as f:
        finfo = json.load(f)
        print("Feature Info:", json.dumps(finfo, indent=2))

# 3. Direct Model Inference
print("\n=== STEP 6: DIRECT MODEL INFERENCE ===")
water_need_pipe = joblib.load(os.path.join(model_dir, "water_need_pipeline.joblib"))
status_pipe = joblib.load(os.path.join(model_dir, "status_pipeline.joblib"))

# Check pipeline feature names / columns expected
input_data_crop = pd.DataFrame([{
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

input_data_label = pd.DataFrame([{
    "label": "rice",
    "N": 66,
    "P": 53,
    "K": 41,
    "temperature": 25.0756354,
    "humidity": 80.52389,
    "ph": 7.778915,
    "rainfall": 257.0039,
    "Soil Moisture": 47.6
}])

print("\n--- Trying Direct Prediction with 'crop': 'rice' ---")
try:
    wn_pred = water_need_pipe.predict(input_data_crop)[0]
    wn_proba = water_need_pipe.predict_proba(input_data_crop)[0]
    wn_classes = water_need_pipe.classes_
    print(f"Prediction: '{wn_pred}'")
    print(f"Classes: {list(wn_classes)}")
    print(f"Probabilities: {dict(zip(wn_classes, wn_proba))}")
except Exception as e:
    print(f"Error predicting with 'crop': {e}")

print("\n--- Trying Direct Prediction with 'label': 'rice' ---")
try:
    wn_pred2 = water_need_pipe.predict(input_data_label)[0]
    wn_proba2 = water_need_pipe.predict_proba(input_data_label)[0]
    wn_classes2 = water_need_pipe.classes_
    print(f"Prediction: '{wn_pred2}'")
    print(f"Classes: {list(wn_classes2)}")
    print(f"Probabilities: {dict(zip(wn_classes2, wn_proba2))}")
except Exception as e:
    print(f"Error predicting with 'label': {e}")
