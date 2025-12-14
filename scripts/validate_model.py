#!/usr/bin/env python3
"""
Validate ML model by comparing with rule-based assignments
"""
import pandas as pd
import numpy as np
import json
import sys
from sklearn.metrics import confusion_matrix, classification_report

def load_training_data():
    """Load the original training data with rule-based assignments"""
    df = pd.read_csv('training_data_initial.csv')
    return df

def predict_with_ml(df):
    """Use the trained model to predict all samples"""
    import xgboost as xgb
    from train_model import engineer_features

    # Load model
    model = xgb.XGBClassifier()
    model.load_model('pool_assignment_model.json')

    # Load metadata
    with open('model_metadata.json', 'r') as f:
        metadata = json.load(f)

    # Engineer features
    X, y_true, _, _, _, _ = engineer_features(df)

    # Remap to model's class space
    class_mapping = {int(k): int(v) for k, v in metadata['class_mapping'].items()}
    reverse_mapping = {int(k): int(v) for k, v in metadata['reverse_mapping'].items()}

    y_true_remapped = y_true.map(class_mapping)

    # Predict
    y_pred_remapped = model.predict(X)

    # Map back to original pool IDs
    y_pred = pd.Series([reverse_mapping[int(p)] + 1 for p in y_pred_remapped])
    y_true_original = y_true + 1  # Convert back to 1-5

    return y_true_original, y_pred

def analyze_disagreements(df, y_true, y_pred):
    """Find cases where ML disagrees with rules"""
    disagreements = df[y_true != y_pred].copy()
    disagreements['rule_pool'] = y_true[y_true != y_pred].values
    disagreements['ml_pool'] = y_pred[y_true != y_pred].values

    return disagreements

def main():
    print("="*70)
    print("ML Model Validation - Comparing with Rule-Based Assignment")
    print("="*70)

    # Load data
    print("\n[1/4] Loading training data...")
    df = load_training_data()
    print(f"   Total samples: {len(df)}")

    # Predict with ML
    print("\n[2/4] Running ML predictions...")
    y_true, y_pred = predict_with_ml(df)

    # Calculate agreement
    print("\n[3/4] Analyzing agreement with rules...")
    agreement = (y_true == y_pred).sum()
    total = len(y_true)
    agreement_rate = agreement / total * 100

    print(f"\n   Agreement Rate: {agreement}/{total} = {agreement_rate:.1f}%")

    if agreement_rate == 100:
        print("   ✓ Perfect agreement! ML model perfectly replicates the rules.")
        print("   This is expected when training on rule-generated labels.")
    else:
        print(f"   ⚠️  {total - agreement} disagreements found.")

    # Show disagreements
    if agreement < total:
        print("\n[4/4] Analyzing disagreements...")
        disagreements = analyze_disagreements(df, y_true, y_pred)

        print(f"\n   Found {len(disagreements)} cases where ML disagrees with rules:")
        print("\n   " + "="*66)
        print(f"   {'ID':<6} {'Score':<8} {'Label':<20} {'Weather':<12} {'Rule':<6} {'ML':<6}")
        print("   " + "="*66)

        for _, row in disagreements.head(10).iterrows():
            print(f"   {str(row['camera_id']):<6} {row['score']:<8} {row['label']:<20} {row['weather_class']:<12} Pool {row['rule_pool']:<4} Pool {row['ml_pool']:<4}")

        if len(disagreements) > 10:
            print(f"   ... and {len(disagreements) - 10} more")

    # Show confusion matrix
    print("\n" + "="*70)
    print("Detailed Analysis")
    print("="*70)

    # Only analyze pools that exist in the data
    existing_pools = sorted(y_true.unique())

    print("\n[Confusion Matrix]")
    cm = confusion_matrix(y_true, y_pred, labels=existing_pools)

    print("\nPredicted →")
    pool_labels = '   '.join([f'P{p}' for p in existing_pools])
    print(f"Actual ↓   {pool_labels}")
    for i, pool in enumerate(existing_pools):
        row_str = ' '.join(f'{x:3d}' for x in cm[i])
        print(f"Pool {pool}:   {row_str}")

    print("\n[Classification Report]")
    target_names = [f'Pool {p}' for p in existing_pools]
    report = classification_report(y_true, y_pred, labels=existing_pools, target_names=target_names, zero_division=0)
    print(report)

    # Key insights
    print("\n" + "="*70)
    print("Key Insights")
    print("="*70)

    print("\n✓ What this tells us:")
    print("  1. Agreement Rate = How well ML learned the rules")
    if agreement_rate == 100:
        print("     → 100% = ML perfectly memorized the rules")
        print("     → This is GOOD for initial training")
        print("     → But it's just a 'copy' of the rules, not smarter")
    else:
        print(f"     → {agreement_rate:.1f}% = ML mostly learned the rules")
        print("     → Disagreements might be:")
        print("        - Model errors (bad)")
        print("        - Or model finding patterns rules missed (good!)")

    print("\n⚠️  What this DOESN'T tell us:")
    print("  1. Whether the pool assignments are ACTUALLY good")
    print("     → We need user feedback (watch time, skip rate)")
    print("  2. How well it generalizes to new cameras")
    print("     → We need to test on cameras NOT in training data")
    print("  3. Whether ML is better than rules")
    print("     → We need A/B testing with real users")

    print("\n" + "="*70)
    print("Validation Complete")
    print("="*70)

    print("\nConclusion:")
    if agreement_rate >= 95:
        print("  ✓ Model successfully learned the rule patterns")
        print("  ✓ Ready for A/B testing with real traffic")
    else:
        print("  ⚠️  Model has significant disagreements with rules")
        print("  → Investigate disagreements before deployment")

    print("\nNext steps:")
    print("  1. Test on NEW cameras (not in training data)")
    print("  2. Compare with actual user behavior (if available)")
    print("  3. Run A/B test: 10% traffic uses ML, 90% uses rules")
    print("  4. Measure: average watch time, skip rate, user satisfaction")
    print()

if __name__ == '__main__':
    main()
