# Kaggle Plant Disease Detection Dataset Analysis Report

Generated: 2026-09-26 14:18:42 UTC

## 1. Executive Summary

- **Dataset Identifier**: `karagwaanntreasure/plant-disease-detection`
- **Source**: [Kaggle Dataset](https://www.kaggle.com/datasets/karagwaanntreasure/plant-disease-detection)
- **Total Valid Images**: 35,725
- **Total Classes**: 23
  - **Healthy Classes**: 5
  - **Disease Classes**: 18
- **Image Dimensions**: 256x256 RGB JPEG
- **Data Integrity**: 100% verified, 0 corrupted / unreadable images
- **Leakage Prevention**: Union-find duplicate clustering enforced, 0 duplicate leakage across splits

---

## 2. Split Distribution (70% Train / 15% Validation / 15% Test)

| Split | Image Count | Percentage |
| :--- | :--- | :--- |
| **Train** | 24,997 | 69.97% |
| **Validation** | 5,350 | 14.98% |
| **Test** | 5,378 | 15.05% |
| **Total** | **35,725** | **100.00%** |

---

## 3. Class Inventory & Distribution

| Index | Class Name | Category | Total Images | Train | Val | Test |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 0 | `Apple___Apple_scab` | Disease | 2,016 | 1,411 | 302 | 303 |
| 1 | `Apple___Black_rot` | Disease | 1,987 | 1,390 | 298 | 299 |
| 2 | `Apple___Cedar_apple_rust` | Disease | 1,760 | 1,232 | 264 | 264 |
| 3 | `Apple___healthy` | Healthy | 2,008 | 1,405 | 301 | 302 |
| 4 | `Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot` | Disease | 1,642 | 1,149 | 246 | 247 |
| 5 | `Corn_(maize)___Common_rust_` | Disease | 1,907 | 1,334 | 286 | 287 |
| 6 | `Corn_(maize)___Northern_Leaf_Blight` | Disease | 1,908 | 1,335 | 286 | 287 |
| 7 | `Corn_(maize)___healthy` | Healthy | 1,859 | 1,301 | 278 | 280 |
| 8 | `Pepper__bell___Bacterial_spot` | Disease | 997 | 697 | 149 | 151 |
| 9 | `Pepper__bell___healthy` | Healthy | 1,478 | 1,034 | 221 | 223 |
| 10 | `Potato___Early_blight` | Disease | 1,000 | 700 | 150 | 150 |
| 11 | `Potato___Late_blight` | Disease | 1,000 | 700 | 150 | 150 |
| 12 | `Potato___healthy` | Healthy | 152 | 106 | 22 | 24 |
| 13 | `Tomato_Bacterial_spot` | Disease | 2,127 | 1,488 | 319 | 320 |
| 14 | `Tomato_Early_blight` | Disease | 1,000 | 700 | 150 | 150 |
| 15 | `Tomato_Late_blight` | Disease | 1,909 | 1,336 | 286 | 287 |
| 16 | `Tomato_Leaf_Mold` | Disease | 952 | 666 | 142 | 144 |
| 17 | `Tomato_Septoria_leaf_spot` | Disease | 1,771 | 1,239 | 265 | 267 |
| 18 | `Tomato_Spider_mites_Two_spotted_spider_mite` | Disease | 1,676 | 1,173 | 251 | 252 |
| 19 | `Tomato__Target_Spot` | Disease | 1,404 | 982 | 210 | 212 |
| 20 | `Tomato__Tomato_YellowLeaf__Curl_Virus` | Disease | 3,208 | 2,245 | 481 | 482 |
| 21 | `Tomato__Tomato_mosaic_virus` | Disease | 373 | 261 | 55 | 57 |
| 22 | `Tomato_healthy` | Healthy | 1,591 | 1,113 | 238 | 240 |

---

## 4. Crops Represented

- **Apple**: Apple scab, Black rot, Cedar apple rust, Healthy
- **Corn (Maize)**: Cercospora leaf spot / Gray leaf spot, Common rust, Northern Leaf Blight, Healthy
- **Pepper (Bell)**: Bacterial spot, Healthy
- **Potato**: Early blight, Late blight, Healthy
- **Tomato**: Bacterial spot, Early blight, Late blight, Leaf Mold, Septoria leaf spot, Spider mites (Two-spotted spider mite), Target Spot, Tomato Yellow Leaf Curl Virus, Tomato Mosaic Virus, Healthy

---

## 5. Directory Structure

```text
ai_training/data/
├── raw/
│   └── plant-disease-detection.zip (533.99 MB)
├── extracted/
│   └── plant-disease-detection/
│       └── Dataset/
│           ├── Apple___Apple_scab/
│           ├── Apple___Black_rot/
│           ├── Apple___Cedar_apple_rust/
│           ├── Apple___healthy/
│           ├── Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot/
│           ├── Corn_(maize)___Common_rust_/
│           ├── Corn_(maize)___Northern_Leaf_Blight/
│           ├── Corn_(maize)___healthy/
│           ├── Pepper__bell___Bacterial_spot/
│           ├── Pepper__bell___healthy/
│           ├── Potato___Early_blight/
│           ├── Potato___Late_blight/
│           ├── Potato___healthy/
│           ├── Tomato_Bacterial_spot/
│           ├── Tomato_Early_blight/
│           ├── Tomato_Late_blight/
│           ├── Tomato_Leaf_Mold/
│           ├── Tomato_Septoria_leaf_spot/
│           ├── Tomato_Spider_mites_Two_spotted_spider_mite/
│           ├── Tomato__Target_Spot/
│           ├── Tomato__Tomato_YellowLeaf__Curl_Virus/
│           ├── Tomato__Tomato_mosaic_virus/
│           └── Tomato_healthy/
└── manifests/
    ├── class_mapping.json
    ├── dataset_manifest.csv
    ├── dataset_split.csv
    ├── train_manifest.csv
    ├── validation_manifest.csv
    ├── test_manifest.csv
    ├── invalid_images.csv
    └── duplicates.csv
```
