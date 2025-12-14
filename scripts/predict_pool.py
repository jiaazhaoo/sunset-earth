#!/usr/bin/env python3
"""
Single camera pool prediction using trained XGBoost model
"""
import sys
import json
import xgboost as xgb
import numpy as np
import pandas as pd

# Load model and metadata (cached globally)
MODEL = None
METADATA = None

def load_model():
    global MODEL, METADATA
    if MODEL is None:
        MODEL = xgb.XGBClassifier()
        MODEL.load_model('pool_assignment_model.json')

        with open('model_metadata.json', 'r') as f:
            METADATA = json.load(f)

    return MODEL, METADATA

def engineer_features(camera_data):
    """Convert camera data to feature vector matching training format"""
    model, metadata = load_model()

    # Initialize feature vector with zeros
    features = np.zeros(metadata['num_features'])

    # Numeric features
    features[0] = camera_data['score']
    features[1] = 1 if camera_data.get('isDaytime') else 0

    # Derived features
    tags = camera_data.get('tags', [])
    weather_resistant_tags = ['City Skyline', 'Street Scene', 'Railway', 'Ski Resort', 'Wildlife']
    features[2] = 1 if any(tag in weather_resistant_tags for tag in tags) else 0

    label = camera_data['label']
    features[3] = 1 if 'night' in label.lower() else 0
    features[4] = 1 if 'sunset' in label or 'sunrise' in label else 0
    features[5] = 1 if 'blue-hour' in label else 0

    # One-hot encoding for label
    label_feature = f"label_{label}"
    if label_feature in metadata['feature_names']:
        idx = metadata['feature_names'].index(label_feature)
        features[idx] = 1

    # One-hot encoding for weather
    weather_feature = f"weather_{camera_data['weatherClass']}"
    if weather_feature in metadata['feature_names']:
        idx = metadata['feature_names'].index(weather_feature)
        features[idx] = 1

    # Multi-hot encoding for tags
    for tag in tags:
        tag_feature = f"tag_{tag}"
        if tag_feature in metadata['feature_names']:
            idx = metadata['feature_names'].index(tag_feature)
            features[idx] = 1

    return features

def predict_pool(camera_data):
    """Predict pool ID for a single camera"""
    model, metadata = load_model()

    # Engineer features
    features = engineer_features(camera_data)

    # Reshape for prediction
    features_2d = features.reshape(1, -1)

    # Predict (returns 0-based class)
    pred_class = model.predict(features_2d)[0]

    # Map back to actual pool ID using reverse mapping
    reverse_mapping = metadata['reverse_mapping']
    pool_id_0based = reverse_mapping[str(int(pred_class))]
    pool_id = pool_id_0based + 1  # Convert back to 1-5

    return pool_id

def main():
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: predict_pool.py <camera_json>"}))
        sys.exit(1)

    try:
        camera_data = json.loads(sys.argv[1])
        pool_id = predict_pool(camera_data)

        # Output result as JSON
        result = {"poolId": int(pool_id)}
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
