#!/usr/bin/env python3
"""
Batch camera pool prediction using trained XGBoost model
Much more efficient than calling predict_pool.py multiple times
"""
import sys
import json
import xgboost as xgb
import numpy as np

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

def engineer_features_batch(cameras_data):
    """Convert batch of camera data to feature matrix"""
    model, metadata = load_model()

    num_cameras = len(cameras_data)
    num_features = metadata['num_features']

    # Initialize feature matrix with zeros
    features_matrix = np.zeros((num_cameras, num_features))

    weather_resistant_tags = ['City Skyline', 'Street Scene', 'Railway', 'Ski Resort', 'Wildlife']

    for i, camera_data in enumerate(cameras_data):
        features = features_matrix[i]

        # Numeric features
        features[0] = camera_data['score']
        features[1] = 1 if camera_data.get('isDaytime') else 0

        # Derived features
        tags = camera_data.get('tags', [])
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

    return features_matrix

def predict_pools_batch(cameras_data):
    """Predict pool IDs for batch of cameras"""
    model, metadata = load_model()

    # Engineer features for all cameras
    features_matrix = engineer_features_batch(cameras_data)

    # Batch predict (returns 0-based classes)
    pred_classes = model.predict(features_matrix)

    # Map back to actual pool IDs
    reverse_mapping = metadata['reverse_mapping']
    pool_ids = []
    for pred_class in pred_classes:
        pool_id_0based = reverse_mapping[str(int(pred_class))]
        pool_id = pool_id_0based + 1  # Convert back to 1-5
        pool_ids.append(int(pool_id))

    return pool_ids

def main():
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: predict_pool_batch.py <cameras_json_array>"}))
        sys.exit(1)

    try:
        cameras_data = json.loads(sys.argv[1])

        if not isinstance(cameras_data, list):
            raise ValueError("Input must be a JSON array of camera objects")

        pool_ids = predict_pools_batch(cameras_data)

        # Output result as JSON
        result = {"poolIds": pool_ids}
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
