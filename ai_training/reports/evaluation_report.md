# AgroAI MobileNetV2 - Model Evaluation Report

**Evaluation Date**: 2026-09-26 14:36:56 UTC  
**Model Checkpoint**: `E:\ai-agro-project\ai_training\models\best_model.pth`  
**Test Set Size**: 5,378 images across 23 classes  

---

## 1. Overall Test Set Performance

| Metric | Score | Note |
| :--- | :--- | :--- |
| **Accuracy** | **89.14%** | 4794/5378 correct classifications |
| **Macro Precision** | **0.8860** | Unweighted average across all 23 classes |
| **Macro Recall** | **0.8880** | Unweighted average sensitivity across classes |
| **Macro F1 Score** | **0.8805** | Harmonic mean of macro precision and recall |
| **Weighted F1 Score** | **0.8905** | Support-weighted F1 reflecting dataset distribution |

---

## 2. Per-Class Metrics

| Class Name | Support | Precision | Recall | F1 Score |
| :--- | :---: | :---: | :---: | :---: |
| `Apple___Apple_scab` | 303 | 0.8750 | 0.9703 | 0.9202 |
| `Apple___Black_rot` | 299 | 0.9091 | 0.9699 | 0.9385 |
| `Apple___Cedar_apple_rust` | 264 | 0.9772 | 0.9735 | 0.9753 |
| `Apple___healthy` | 302 | 0.9308 | 0.9801 | 0.9548 |
| `Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot` | 247 | 0.8382 | 0.9231 | 0.8786 |
| `Corn_(maize)___Common_rust_` | 287 | 0.9853 | 0.9338 | 0.9589 |
| `Corn_(maize)___healthy` | 280 | 0.9689 | 1.0000 | 0.9842 |
| `Corn_(maize)___Northern_Leaf_Blight` | 287 | 0.9018 | 0.8955 | 0.8986 |
| `Pepper__bell___Bacterial_spot` | 151 | 0.8554 | 0.9404 | 0.8959 |
| `Pepper__bell___healthy` | 223 | 0.9402 | 0.9865 | 0.9628 |
| `Potato___Early_blight` | 150 | 0.8922 | 0.9933 | 0.9401 |
| `Potato___healthy` | 24 | 0.7742 | 1.0000 | 0.8727 |
| `Potato___Late_blight` | 150 | 0.9680 | 0.8067 | 0.8800 |
| `Tomato__Target_Spot` | 212 | 0.6804 | 0.7028 | 0.6914 |
| `Tomato__Tomato_mosaic_virus` | 57 | 0.8644 | 0.8947 | 0.8793 |
| `Tomato__Tomato_YellowLeaf__Curl_Virus` | 482 | 0.9894 | 0.9710 | 0.9801 |
| `Tomato_Bacterial_spot` | 320 | 0.9534 | 0.8313 | 0.8881 |
| `Tomato_Early_blight` | 150 | 0.7219 | 0.7267 | 0.7243 |
| `Tomato_healthy` | 240 | 0.6340 | 0.9958 | 0.7747 |
| `Tomato_Late_blight` | 287 | 0.9127 | 0.7282 | 0.8101 |
| `Tomato_Leaf_Mold` | 144 | 0.9297 | 0.8264 | 0.8750 |
| `Tomato_Septoria_leaf_spot` | 267 | 0.8954 | 0.8015 | 0.8458 |
| `Tomato_Spider_mites_Two_spotted_spider_mite` | 252 | 0.9796 | 0.5714 | 0.7218 |

---

## 3. Artifacts Generated

- **Confusion Matrix Plot**: `outputs/plots/confusion_matrix.png`
- **Per-Class Metrics CSV**: `outputs/per_class_metrics.csv`
- **Itemized Predictions CSV**: `outputs/test_predictions.csv`
- **Evaluation Summary JSON**: `reports/evaluation_report.json`
