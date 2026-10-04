import os
import pandas as pd
import joblib

model_dir = os.path.join("backend", "models", "decision_tree_v2")
water_need_pipe = joblib.load(os.path.join(model_dir, "water_need_pipeline.joblib"))

# Base exact test case values:
# N = 66, P = 53, K = 41, temperature = 25.0756354, humidity = 80.52389, ph = 7.778915, rainfall = 257.0039, crop = rice, Soil Moisture = 47.6

test_cases = [
    {"name": "Exact CSV Row (Soil Moisture 47.6)", "soil_moisture": 47.6, "N": 66, "P": 53, "K": 41, "crop": "rice", "temp": 25.0756354, "hum": 80.52389, "ph": 7.778915, "rain": 257.0039},
    {"name": "Default field soilMoisture 45.0", "soil_moisture": 45.0, "N": 66, "P": 53, "K": 41, "crop": "rice", "temp": 25.0756354, "hum": 80.52389, "ph": 7.778915, "rain": 257.0039},
    {"name": "Default field soilMoisture 35.0", "soil_moisture": 35.0, "N": 66, "P": 53, "K": 41, "crop": "rice", "temp": 25.0756354, "hum": 80.52389, "ph": 7.778915, "rain": 257.0039},
    {"name": "Default field temp 28.0, ph 6.5, rain 100", "soil_moisture": 45.0, "N": 90, "P": 42, "K": 43, "crop": "rice", "temp": 28.0, "hum": 65.0, "ph": 6.5, "rain": 100.0},
    {"name": "Default field temp 28.0, ph 6.5, rain 100, SM 47.6", "soil_moisture": 47.6, "N": 90, "P": 42, "K": 43, "crop": "rice", "temp": 28.0, "hum": 65.0, "ph": 6.5, "rain": 100.0},
    {"name": "Default field N=66 P=53 K=41 temp=28 ph=6.5 rain=100 SM=47.6", "soil_moisture": 47.6, "N": 66, "P": 53, "K": 41, "crop": "rice", "temp": 28.0, "hum": 65.0, "ph": 6.5, "rain": 100.0},
    {"name": "Crop = Rice (Capital R)", "soil_moisture": 47.6, "N": 66, "P": 53, "K": 41, "crop": "Rice", "temp": 25.0756354, "hum": 80.52389, "ph": 7.778915, "rain": 257.0039},
    {"name": "Crop = Tomato", "soil_moisture": 47.6, "N": 66, "P": 53, "K": 41, "crop": "tomato", "temp": 25.0756354, "hum": 80.52389, "ph": 7.778915, "rain": 257.0039},
]

print("=== INFERENCE MATRIX DIAGNOSIS ===")
for tc in test_cases:
    df_tc = pd.DataFrame([{
        "crop": tc["crop"],
        "N": tc["N"],
        "P": tc["P"],
        "K": tc["K"],
        "temperature": tc["temp"],
        "humidity": tc["hum"],
        "ph": tc["ph"],
        "rainfall": tc["rain"],
        "Soil Moisture": tc["soil_moisture"]
    }])
    pred = water_need_pipe.predict(df_tc)[0]
    proba = water_need_pipe.predict_proba(df_tc)[0]
    prob_dict = {cls: round(float(p * 100), 1) for cls, p in zip(water_need_pipe.classes_, proba)}
    print(f"\n{tc['name']}:")
    print(f"  Prediction: '{pred}'")
    print(f"  Probabilities: {prob_dict}")
