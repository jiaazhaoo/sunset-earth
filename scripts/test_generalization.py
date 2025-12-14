#!/usr/bin/env python3
"""
Test model generalization with synthetic test cases
Since we don't have real unseen data, we create edge cases to test robustness
"""
import json
import sys

def predict_pool(camera_data):
    """Call the prediction script"""
    import subprocess
    result = subprocess.run(
        ['python3', 'scripts/predict_pool.py', json.dumps(camera_data)],
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)

def test_edge_cases():
    """Test edge cases that might reveal model weaknesses"""

    test_cases = [
        # Case 1: Very high score, clear weather → Should be Pool 4 (or Pool 1-3 if golden hour)
        {
            "name": "High score clear day",
            "data": {"score": 95, "label": "clear-day", "weatherClass": "clear", "isDaytime": True, "tags": []},
            "expected_range": [1, 2, 3, 4],
            "reason": "High score should be in top pools"
        },

        # Case 2: Very low score → Should be Pool 5
        {
            "name": "Very low score",
            "data": {"score": 10, "label": "clear-day", "weatherClass": "other", "isDaytime": True, "tags": []},
            "expected_range": [5],
            "reason": "Score 10 is too low for display"
        },

        # Case 3: Sunset with high score → Should be Pool 1 or 2
        {
            "name": "Sunset high score",
            "data": {"score": 92, "label": "sunset-primary", "weatherClass": "clear", "isDaytime": False, "tags": []},
            "expected_range": [1, 2],
            "reason": "Golden hour with high score should be Pool 1-2"
        },

        # Case 4: Weather-resistant camera with bad weather
        {
            "name": "Skyline bad weather",
            "data": {"score": 22, "label": "city-skyline-night", "weatherClass": "other", "isDaytime": False, "tags": ["City Skyline"]},
            "expected_range": [4, 5],
            "reason": "Skyline can handle bad weather, score 22 is borderline"
        },

        # Case 5: Night scene low score
        {
            "name": "Night scene low score",
            "data": {"score": 16, "label": "night", "weatherClass": "clear", "isDaytime": False, "tags": []},
            "expected_range": [4, 5],
            "reason": "Night scenes valuable even at low scores (threshold 15)"
        },

        # Case 6: Borderline score (exactly threshold)
        {
            "name": "Exactly threshold score",
            "data": {"score": 35, "label": "clear-day", "weatherClass": "clear", "isDaytime": True, "tags": []},
            "expected_range": [4],
            "reason": "Score 35 is exactly Pool 4 threshold"
        },

        # Case 7: Unknown label (not in training)
        {
            "name": "Unknown label",
            "data": {"score": 60, "label": "sunset-extended-after", "weatherClass": "clear", "isDaytime": False, "tags": []},
            "expected_range": [2, 3, 4],
            "reason": "Unknown label should still work based on score"
        },

        # Case 8: Unknown tag (not in training)
        {
            "name": "Unknown tag",
            "data": {"score": 50, "label": "clear-day", "weatherClass": "clear", "isDaytime": True, "tags": ["Beach", "Volcano"]},
            "expected_range": [4],
            "reason": "Unknown tags should be ignored, score 50 → Pool 4"
        },

        # Case 9: Multiple weather-resistant tags
        {
            "name": "Multiple resistant tags",
            "data": {"score": 20, "label": "clear-day", "weatherClass": "other", "isDaytime": True, "tags": ["City Skyline", "Street Scene"]},
            "expected_range": [4],
            "reason": "Weather-resistant with score 20 should be Pool 4"
        },

        # Case 10: Blue hour
        {
            "name": "Blue hour",
            "data": {"score": 80, "label": "blue-hour-sunset", "weatherClass": "clear", "isDaytime": False, "tags": []},
            "expected_range": [2, 3],
            "reason": "Blue hour with good score should be Pool 2-3"
        },
    ]

    return test_cases

def main():
    print("="*80)
    print("Model Generalization Test - Edge Cases & Robustness")
    print("="*80)

    test_cases = test_edge_cases()

    print(f"\nTesting {len(test_cases)} edge cases...\n")

    passed = 0
    failed = 0
    issues = []

    for i, test_case in enumerate(test_cases, 1):
        name = test_case["name"]
        data = test_case["data"]
        expected_range = test_case["expected_range"]
        reason = test_case["reason"]

        try:
            result = predict_pool(data)
            predicted_pool = result.get("poolId")

            if predicted_pool in expected_range:
                status = "✓ PASS"
                passed += 1
            else:
                status = "✗ FAIL"
                failed += 1
                issues.append({
                    "test": name,
                    "expected": expected_range,
                    "got": predicted_pool,
                    "reason": reason,
                    "data": data
                })

            print(f"[{i:2d}] {status} - {name}")
            print(f"     Input: score={data['score']}, label={data['label']}, weather={data['weatherClass']}")
            print(f"     Tags: {data['tags']}")
            print(f"     Expected: Pool {expected_range}, Got: Pool {predicted_pool}")
            print(f"     Reason: {reason}")
            print()

        except Exception as e:
            print(f"[{i:2d}] ✗ ERROR - {name}")
            print(f"     Error: {str(e)}")
            print()
            failed += 1
            issues.append({
                "test": name,
                "expected": expected_range,
                "got": "ERROR",
                "reason": str(e),
                "data": data
            })

    # Summary
    print("="*80)
    print("Test Results Summary")
    print("="*80)
    print(f"\nTotal tests: {len(test_cases)}")
    print(f"Passed: {passed} ({passed/len(test_cases)*100:.1f}%)")
    print(f"Failed: {failed} ({failed/len(test_cases)*100:.1f}%)")

    if issues:
        print("\n" + "="*80)
        print("Issues Found")
        print("="*80)

        for issue in issues:
            print(f"\n⚠️  {issue['test']}")
            print(f"   Expected: Pool {issue['expected']}")
            print(f"   Got: Pool {issue['got']}")
            print(f"   Reason: {issue['reason']}")
            print(f"   Data: {issue['data']}")

    # Interpretation
    print("\n" + "="*80)
    print("Interpretation")
    print("="*80)

    if passed == len(test_cases):
        print("\n✓ EXCELLENT: Model handles all edge cases correctly!")
        print("  → The model generalizes well beyond training data")
        print("  → Safe to test with real traffic")
    elif passed >= len(test_cases) * 0.8:
        print("\n⚠️  GOOD: Model handles most edge cases")
        print(f"  → {failed} edge cases failed - review them")
        print("  → Consider adding failed cases to training data")
        print("  → Safe for limited A/B testing")
    elif passed >= len(test_cases) * 0.6:
        print("\n⚠️  FAIR: Model has some issues with edge cases")
        print(f"  → {failed} edge cases failed")
        print("  → Add more diverse training data")
        print("  → Use with caution in production")
    else:
        print("\n✗ POOR: Model struggles with edge cases")
        print(f"  → {failed} edge cases failed")
        print("  → Model may not generalize well")
        print("  → NOT recommended for production use")
        print("  → Need more training data and manual annotations")

    print("\n" + "="*80)
    print("Key Takeaways")
    print("="*80)

    print("\n1. What we tested:")
    print("   - Extreme scores (very high/low)")
    print("   - Unknown labels and tags")
    print("   - Borderline threshold cases")
    print("   - Special conditions (night scenes, weather-resistant)")

    print("\n2. What this reveals:")
    if passed >= len(test_cases) * 0.8:
        print("   ✓ Model learned generalizable patterns, not just memorization")
        print("   ✓ Can handle unseen inputs reasonably well")
    else:
        print("   ⚠️  Model may be overfitting to training data")
        print("   ⚠️  Struggles with cases not exactly like training samples")

    print("\n3. Limitations of this test:")
    print("   - Synthetic test cases, not real user scenarios")
    print("   - We don't know if predictions are 'better' than rules")
    print("   - Need real user feedback to validate quality")

    print("\n4. Recommended next steps:")
    if passed >= len(test_cases) * 0.8:
        print("   1. ✓ Model ready for A/B testing")
        print("   2. Deploy to 5-10% of traffic")
        print("   3. Measure: watch time, skip rate, user engagement")
        print("   4. Compare ML vs Rules with statistical significance")
    else:
        print("   1. Review and fix failed edge cases")
        print("   2. Add edge cases to manual annotations")
        print("   3. Retrain model with augmented data")
        print("   4. Re-run this test before deployment")

    print()

    return 0 if failed == 0 else 1

if __name__ == '__main__':
    sys.exit(main())
