#!/usr/bin/env python3
import xgboost as xgb
import numpy as np
import json
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

def main():
    print("="*60)
    print("Exporting XGBoost Model to ONNX")
    print("="*60)

    # Load metadata
    print("\n[1/3] Loading model metadata...")
    with open('model_metadata.json', 'r') as f:
        metadata = json.load(f)

    num_features = metadata['num_features']
    print(f"   Features: {num_features}")

    # Load XGBoost model
    print("\n[2/3] Loading XGBoost model...")
    model = xgb.XGBClassifier()
    model.load_model('pool_assignment_model.json')
    print("   ✓ Model loaded")

    # Convert to ONNX
    print("\n[3/3] Converting to ONNX format...")

    initial_type = [('float_input', FloatTensorType([None, num_features]))]

    try:
        onnx_model = convert_sklearn(
            model,
            initial_types=initial_type,
            target_opset=12
        )

        # Save ONNX model
        with open("pool_assignment_model.onnx", "wb") as f:
            f.write(onnx_model.SerializeToString())

        print("   ✓ ONNX model saved to pool_assignment_model.onnx")

        # Get file size
        import os
        file_size = os.path.getsize("pool_assignment_model.onnx")
        print(f"   Model size: {file_size / 1024:.1f} KB")

    except Exception as e:
        print(f"   ERROR: Failed to convert to ONNX")
        print(f"   {str(e)}")
        print("\n   Note: ONNX export may have issues with XGBoost models")
        print("   Alternative: Use the JSON model directly or create a custom inference layer")
        return

    print("\n" + "="*60)
    print("Export Complete!")
    print("="*60)
    print("\nNext steps:")
    print("  1. Test ONNX model with test data")
    print("  2. Integrate into TypeScript (see ML_TRAINING_PLAN.md Phase 4)")
    print()

if __name__ == '__main__':
    main()
