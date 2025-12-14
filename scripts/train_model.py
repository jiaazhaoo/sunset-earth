#!/usr/bin/env python3
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.preprocessing import MultiLabelBinarizer
import xgboost as xgb
import json
import sys

def engineer_features(df):
    """Feature engineering matching TypeScript logic"""

    # Numeric features
    X_numeric = pd.DataFrame()
    X_numeric['score'] = df['score']

    # Handle is_daytime - convert to 0/1, treating undefined/empty as 0
    X_numeric['is_daytime'] = df['is_daytime'].apply(
        lambda x: 1 if x in ['true', True, 1] else 0
    )

    # Parse tags
    df['tags_list'] = df['tags'].fillna('').apply(
        lambda x: [tag.strip() for tag in str(x).split('|') if tag.strip()]
    )

    # Derived features
    weather_resistant_tags = ['City Skyline', 'Street Scene', 'Railway', 'Ski Resort', 'Wildlife']
    X_numeric['is_weather_resistant'] = df['tags_list'].apply(
        lambda tags: int(any(tag in weather_resistant_tags for tag in tags))
    )

    X_numeric['is_night_scene'] = df['label'].apply(
        lambda x: int('night' in str(x).lower())
    )

    X_numeric['is_golden_hour'] = df['label'].apply(
        lambda x: int('sunset' in str(x) or 'sunrise' in str(x))
    )

    X_numeric['is_blue_hour'] = df['label'].apply(
        lambda x: int('blue-hour' in str(x))
    )

    # One-hot encoding for label
    label_dummies = pd.get_dummies(df['label'], prefix='label')

    # One-hot encoding for weather_class
    weather_dummies = pd.get_dummies(df['weather_class'], prefix='weather')

    # Multi-hot encoding for tags
    mlb = MultiLabelBinarizer()
    tags_encoded = pd.DataFrame(
        mlb.fit_transform(df['tags_list']),
        columns=[f'tag_{tag}' for tag in mlb.classes_],
        index=df.index
    )

    # Combine all features
    X = pd.concat([X_numeric, label_dummies, weather_dummies, tags_encoded], axis=1)

    # Target variable (convert from 1-5 to 0-4 for XGBoost)
    y = df['pool_id'] - 1

    # Sample weight (if source column exists)
    sample_weight = None
    if 'source' in df.columns:
        sample_weight = df['source'].apply(
            lambda x: 10.0 if x == 'manual' else 1.0
        ).values

    return X, y, sample_weight, mlb, label_dummies.columns.tolist(), weather_dummies.columns.tolist()

def main():
    print("="*60)
    print("Camera Pool Assignment ML Training")
    print("="*60)

    # 1. Load data
    print("\n[1/6] Loading training data...")
    try:
        df = pd.read_csv('training_data_initial.csv')
        print(f"   Loaded {len(df)} samples")
    except FileNotFoundError:
        print("   ERROR: training_data_initial.csv not found!")
        print("   Run: npx tsx --env-file=.env.local scripts/export_training_data.ts")
        sys.exit(1)

    # Check if manual annotations exist
    try:
        df_manual = pd.read_csv('training_data_manual.csv')
        print(f"   Found {len(df_manual)} manual annotations")
        df = pd.concat([df, df_manual]).drop_duplicates(subset=['camera_id'], keep='last')
        print(f"   Total samples after merge: {len(df)}")
    except FileNotFoundError:
        print("   No manual annotations found (training_data_manual.csv)")
        print("   Using rule-based labels only")

    # 2. Feature engineering
    print("\n[2/6] Engineering features...")
    X, y, sample_weight, mlb, label_classes, weather_classes = engineer_features(df)
    print(f"   Created {X.shape[1]} features")
    print(f"   Feature breakdown:")
    print(f"     - Numeric: 6 (score, is_daytime, 4 derived)")
    print(f"     - Label one-hot: {len(label_classes)}")
    print(f"     - Weather one-hot: {len(weather_classes)}")
    print(f"     - Tag multi-hot: {sum(1 for col in X.columns if col.startswith('tag_'))}")

    # Print pool distribution
    print(f"\n   Pool distribution:")
    for pool_id in range(5):
        count = sum(y == pool_id)
        actual_pool = pool_id + 1
        print(f"     Pool {actual_pool}: {count} cameras ({count/len(y)*100:.1f}%)")

    # 3. Split data
    print("\n[3/6] Splitting train/test sets...")

    # Check class distribution
    unique_classes = sorted(y.unique())
    if len(unique_classes) < 5:
        print(f"   WARNING: Only {len(unique_classes)} out of 5 pools have data: {[c+1 for c in unique_classes]}")
        print(f"   This is normal if we don't have golden hour data yet")

    if len(df) < 20:
        print("   WARNING: Very small dataset, using all data for training")
        X_train, X_test = X, X
        y_train, y_test = y, y
        sw_train, sw_test = sample_weight, sample_weight
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        if sample_weight is not None:
            sw_train = sample_weight[X_train.index]
            sw_test = sample_weight[X_test.index]
        else:
            sw_train, sw_test = None, None

    print(f"   Train: {len(X_train)} samples")
    print(f"   Test: {len(X_test)} samples")

    # 4. Train XGBoost
    print("\n[4/6] Training XGBoost model...")

    # Use actual number of unique classes in training data
    num_classes = len(unique_classes)
    print(f"   Training for {num_classes} classes (pools {[c+1 for c in unique_classes]})")

    # Remap y values to 0-based continuous range for XGBoost
    # Create mapping: original_class -> new_class
    class_mapping = {old_class: new_class for new_class, old_class in enumerate(sorted(unique_classes))}
    reverse_mapping = {new_class: old_class for old_class, new_class in class_mapping.items()}

    y_train_remapped = y_train.map(class_mapping)
    y_test_remapped = y_test.map(class_mapping)

    model = xgb.XGBClassifier(
        max_depth=6,
        n_estimators=50,
        learning_rate=0.1,
        objective='multi:softmax',
        num_class=num_classes,
        random_state=42,
        eval_metric='mlogloss'
    )

    model.fit(X_train, y_train_remapped, sample_weight=sw_train, verbose=False)
    print("   ✓ Training complete")

    # 5. Evaluate
    print("\n[5/6] Evaluating model...")
    y_pred_train_remapped = model.predict(X_train)
    y_pred_test_remapped = model.predict(X_test)

    train_acc = accuracy_score(y_train_remapped, y_pred_train_remapped)
    test_acc = accuracy_score(y_test_remapped, y_pred_test_remapped)

    print(f"   Train accuracy: {train_acc:.3f}")
    print(f"   Test accuracy:  {test_acc:.3f}")

    print("\n   Classification Report (Test Set):")
    print("   " + "="*50)
    # Only show target names for pools that exist in data
    target_names = [f'Pool {reverse_mapping[i]+1}' for i in range(num_classes)]
    report = classification_report(y_test_remapped, y_pred_test_remapped, target_names=target_names, zero_division=0)
    for line in report.split('\n'):
        print(f"   {line}")

    print("\n   Confusion Matrix (Test Set):")
    print("   " + "="*50)
    cm = confusion_matrix(y_test_remapped, y_pred_test_remapped)
    print("   Predicted →")
    pool_labels = '   '.join([f'P{reverse_mapping[i]+1}' for i in range(num_classes)])
    print(f"   Actual ↓   {pool_labels}")
    for i, row in enumerate(cm):
        print(f"   Pool {reverse_mapping[i]+1}:   {' '.join(f'{x:3d}' for x in row)}")

    # Feature importance
    print("\n   Top 10 Important Features:")
    print("   " + "="*50)
    feature_importance = pd.DataFrame({
        'feature': X.columns,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)

    for idx, row in feature_importance.head(10).iterrows():
        print(f"   {row['feature']:30s} {row['importance']:.4f}")

    # 6. Save model
    print("\n[6/6] Saving model and metadata...")

    # Save XGBoost model
    model.save_model('pool_assignment_model.json')
    print("   ✓ Saved pool_assignment_model.json")

    # Save feature metadata
    metadata = {
        'feature_names': X.columns.tolist(),
        'tag_classes': [f'tag_{tag}' for tag in mlb.classes_],
        'label_classes': label_classes,
        'weather_classes': weather_classes,
        'num_features': X.shape[1],
        'train_accuracy': float(train_acc),
        'test_accuracy': float(test_acc),
        'training_samples': len(df),
        'pool_distribution': {
            f'pool_{i+1}': int(sum(y == i)) for i in range(5)
        },
        'class_mapping': {int(k): int(v) for k, v in class_mapping.items()},
        'reverse_mapping': {int(k): int(v) for k, v in reverse_mapping.items()},
        'trained_pools': [int(c)+1 for c in sorted(unique_classes)]
    }

    with open('model_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    print("   ✓ Saved model_metadata.json")

    print("\n" + "="*60)
    print("Training Complete!")
    print("="*60)
    print(f"\nModel Accuracy: {test_acc:.1%}")
    print("\nNext steps:")
    print("  1. Review model performance above")
    print("  2. If satisfactory, export to ONNX: python3 scripts/export_to_onnx.py")
    print("  3. Integrate into TypeScript: see ML_TRAINING_PLAN.md Phase 4")
    print()

if __name__ == '__main__':
    main()
