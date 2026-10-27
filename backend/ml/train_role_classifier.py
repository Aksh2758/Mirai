"""
train_role_classifier.py

Trains a Random Forest classifier that predicts a broad ROLE FAMILY
(stable over time) from a Scanner-style feature vector. This is the
"what kind of engineer is this person becoming" step in the pipeline.
Groq is still responsible for turning that family into a specific,
current role title and project recommendations, using live signals
from Discovery Hub.

WHY BOOTSTRAPPED LABELS:
There is no existing labeled dataset of "GitHub/resume feature vector
-> correct role family" for this exact feature schema. Rather than
scrape one together, we bootstrap labels using explicit domain rules
(the same kind of logic your rubric already encodes), generate a large
synthetic population of feature vectors + rule-derived labels with
added noise, and train the Random Forest on that. This is a standard,
defensible way to get a first working classifier — document this
choice plainly in your report. Retraining later is cheap: regenerate
the bootstrap set (or swap in a real dataset if you find one that fits
this schema) and refit.

FEATURES (must match what your Scanner already computes or can compute):
  pct_python, pct_js_ts, pct_java_kotlin, pct_cpp_c, pct_go_rust, pct_sql
      -> language usage percentages (0-100), from GitHub/resume parsing
  framework_diversity   (0-1)  -> breadth of frameworks/libraries used
  project_complexity    (0-1)  -> repo structure/size/test-presence score
  activity_recency      (0-1)  -> how recent the user's activity is
  doc_quality           (0-1)  -> README/documentation quality score
  has_ml_libraries       (0/1) -> pandas/sklearn/tensorflow/pytorch present
  has_web_framework      (0/1) -> react/django/express/flask/fastapi present
  has_infra_tools        (0/1) -> docker/kubernetes/terraform/ci-cd present
  has_mobile_framework   (0/1) -> flutter/react-native/swift/kotlin-android
  has_data_pipeline_tools(0/1) -> spark/airflow/kafka/dbt present

ROLE FAMILIES (8 stable classes — Groq specializes these further):
  Backend Development, Frontend Development, Full-Stack Development,
  ML / AI Engineering, Data Engineering, DevOps / Cloud Infrastructure,
  Mobile Development, Security Engineering
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.preprocessing import LabelEncoder
import joblib

RANDOM_SEED = 42
rng = np.random.default_rng(RANDOM_SEED)

FEATURE_NAMES = [
    "pct_python", "pct_js_ts", "pct_java_kotlin", "pct_cpp_c", "pct_go_rust", "pct_sql",
    "framework_diversity", "project_complexity", "activity_recency", "doc_quality",
    "has_ml_libraries", "has_web_framework", "has_infra_tools",
    "has_mobile_framework", "has_data_pipeline_tools",
]

ROLE_FAMILIES = [
    "Backend Development",
    "Frontend Development",
    "Full-Stack Development",
    "ML / AI Engineering",
    "Data Engineering",
    "DevOps / Cloud Infrastructure",
    "Mobile Development",
    "Security Engineering",
]


def bootstrap_rule_label(row: dict) -> str:
    """Deterministic domain-rule labeling function used ONLY to generate
    bootstrap training labels. This mirrors the kind of logic a rubric-based
    system would use — the Random Forest is trained to generalize beyond
    these hard boundaries, not to memorize them."""
    if row["has_ml_libraries"] and row["pct_python"] > 40:
        return "ML / AI Engineering"
    if row["has_data_pipeline_tools"]:
        return "Data Engineering"
    if row["has_mobile_framework"]:
        return "Mobile Development"
    if row["has_infra_tools"] and row["project_complexity"] > 0.5 and not row["has_web_framework"]:
        return "DevOps / Cloud Infrastructure"
    if row["pct_python"] < 15 and row["has_infra_tools"] and row["framework_diversity"] < 0.3:
        return "Security Engineering"
    if row["has_web_framework"] and row["pct_js_ts"] > 35 and row["pct_python"] < 20 and row["pct_java_kotlin"] < 20:
        return "Frontend Development"
    if row["has_web_framework"] and (row["pct_python"] > 20 or row["pct_java_kotlin"] > 20) and row["pct_js_ts"] < 30:
        return "Backend Development"
    if row["has_web_framework"] and row["pct_js_ts"] > 20 and (row["pct_python"] > 15 or row["pct_java_kotlin"] > 15):
        return "Full-Stack Development"
    # fallback: pick the family implied by the dominant language
    langs = {"Backend Development": row["pct_python"] + row["pct_java_kotlin"] + row["pct_go_rust"],
             "Frontend Development": row["pct_js_ts"],
             "Data Engineering": row["pct_sql"]}
    return max(langs, key=langs.get)


def generate_bootstrap_dataset(n_samples: int = 4000) -> pd.DataFrame:
    """Generates a synthetic, noisy population of feature vectors and
    labels them with the rule function above. Noise + randomized feature
    combinations prevent the Random Forest from trivially re-deriving the
    exact rule boundaries, so it learns a softer, generalized decision
    surface instead."""
    rows = []
    for _ in range(n_samples):
        # pick a rough persona to keep language percentages realistic (sum ~ <=100)
        persona = rng.choice(["ml", "backend", "frontend", "fullstack", "mobile", "devops", "data", "security", "mixed"])
        pct_python = pct_js = pct_java = pct_cpp = pct_go = pct_sql = 0.0

        if persona == "ml":
            pct_python = rng.uniform(45, 85)
            pct_sql = rng.uniform(0, 15)
        elif persona == "backend":
            # Real backend engineers are usually dominated by ONE language, so sample a
            # dominant language with a wide range instead of a narrow mixed band. This
            # keeps Java-heavy / Go-heavy / Python-heavy backends inside the training
            # distribution (a narrow band made them look like "Mobile" to the model).
            dominant = rng.choice(["python", "java", "go"])
            if dominant == "python":
                pct_python = rng.uniform(35, 85)
                pct_sql = rng.uniform(0, 25)
            elif dominant == "java":
                pct_java = rng.uniform(35, 85)
                pct_sql = rng.uniform(0, 25)
            else:
                pct_go = rng.uniform(30, 80)
                pct_python = rng.uniform(0, 25)
        elif persona == "frontend":
            pct_js = rng.uniform(50, 90)
        elif persona == "fullstack":
            pct_js = rng.uniform(25, 55)
            pct_python = rng.uniform(15, 40)
            pct_java = rng.uniform(0, 20)
        elif persona == "mobile":
            pct_java = rng.uniform(20, 60)
            pct_js = rng.uniform(0, 20)
        elif persona == "devops":
            pct_python = rng.uniform(10, 30)
            pct_go = rng.uniform(10, 40)
            pct_cpp = rng.uniform(0, 15)
        elif persona == "data":
            pct_python = rng.uniform(20, 50)
            pct_sql = rng.uniform(20, 55)
        elif persona == "security":
            pct_python = rng.uniform(5, 25)
            pct_cpp = rng.uniform(10, 40)
        else:  # mixed / noisy
            pct_python = rng.uniform(0, 40)
            pct_js = rng.uniform(0, 40)
            pct_java = rng.uniform(0, 40)
            pct_cpp = rng.uniform(0, 30)
            pct_go = rng.uniform(0, 20)
            pct_sql = rng.uniform(0, 30)

        has_ml = int(persona == "ml" or (persona in ("data", "mixed") and pct_python > 40 and rng.random() < 0.3))
        has_web = int(persona in ("backend", "frontend", "fullstack") or rng.random() < 0.15)
        has_infra = int(persona in ("devops", "security") or rng.random() < 0.1)
        has_mobile = int(persona == "mobile" or rng.random() < 0.05)
        has_data_pipe = int(persona == "data" or rng.random() < 0.08)

        row = {
            "pct_python": round(pct_python, 1),
            "pct_js_ts": round(pct_js, 1),
            "pct_java_kotlin": round(pct_java, 1),
            "pct_cpp_c": round(pct_cpp, 1),
            "pct_go_rust": round(pct_go, 1),
            "pct_sql": round(pct_sql, 1),
            "framework_diversity": round(rng.uniform(0, 1), 2),
            "project_complexity": round(rng.uniform(0, 1), 2),
            "activity_recency": round(rng.uniform(0, 1), 2),
            "doc_quality": round(rng.uniform(0, 1), 2),
            "has_ml_libraries": has_ml,
            "has_web_framework": has_web,
            "has_infra_tools": has_infra,
            "has_mobile_framework": has_mobile,
            "has_data_pipeline_tools": has_data_pipe,
        }
        row["role_family"] = bootstrap_rule_label(row)
        rows.append(row)

    df = pd.DataFrame(rows)

    # label noise: flip ~6% of labels to a random other class so the
    # Random Forest doesn't just memorize the rule function perfectly
    noise_mask = rng.random(len(df)) < 0.06
    for idx in df[noise_mask].index:
        current = df.loc[idx, "role_family"]
        alt = rng.choice([r for r in ROLE_FAMILIES if r != current])
        df.loc[idx, "role_family"] = alt

    return df


def train_and_save(df: pd.DataFrame, model_path: str = "role_classifier.joblib",
                    encoder_path: str = "role_label_encoder.joblib"):
    X = df[FEATURE_NAMES]
    y = df["role_family"]

    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y_enc, test_size=0.2, random_state=RANDOM_SEED, stratify=y_enc
    )

    clf = RandomForestClassifier(
        n_estimators=300, max_depth=12, min_samples_leaf=3,
        random_state=RANDOM_SEED, class_weight="balanced",
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nTest accuracy: {acc:.3f}\n")
    print("Classification report:")
    print(classification_report(y_test, y_pred, target_names=le.classes_))
    print("Confusion matrix (rows=actual, cols=predicted):")
    cm = confusion_matrix(y_test, y_pred)
    print(pd.DataFrame(cm, index=le.classes_, columns=le.classes_))

    print("\nFeature importances:")
    importances = sorted(zip(FEATURE_NAMES, clf.feature_importances_), key=lambda x: -x[1])
    for name, score in importances:
        print(f"  {name:<24s} {score:.3f}")

    joblib.dump(clf, model_path)
    joblib.dump(le, encoder_path)
    print(f"\nSaved model to {model_path}")
    print(f"Saved label encoder to {encoder_path}")
    return clf, le


def predict_role(features: dict, clf=None, le=None,
                  model_path: str = "role_classifier.joblib",
                  encoder_path: str = "role_label_encoder.joblib") -> dict:
    """Inference helper. `features` must contain all keys in FEATURE_NAMES
    (see docstring at top of file for what each one means and how to
    compute it from Scanner's existing GitHub/resume parsing output).

    Returns:
        {
          "predicted_role": str,
          "confidence": float,           # 0-1, top class probability
          "all_probabilities": {role: probability, ...},
          "low_confidence": bool         # True if top prob < 0.5 —
                                          # caller should let Groq reason
                                          # freely instead of anchoring
                                          # hard on this prediction
        }
    """
    if clf is None:
        clf = joblib.load(model_path)
    if le is None:
        le = joblib.load(encoder_path)

    X = pd.DataFrame([[features[f] for f in FEATURE_NAMES]], columns=FEATURE_NAMES)
    probs = clf.predict_proba(X)[0]
    top_idx = int(np.argmax(probs))

    return {
        "predicted_role": le.classes_[top_idx],
        "confidence": round(float(probs[top_idx]), 3),
        "all_probabilities": {
            le.classes_[i]: round(float(p), 3) for i, p in enumerate(probs)
        },
        "low_confidence": bool(probs[top_idx] < 0.5),
    }


if __name__ == "__main__":
    print("Generating bootstrap training dataset...")
    dataset = generate_bootstrap_dataset(n_samples=4000)
    dataset.to_csv("bootstrap_training_data.csv", index=False)
    print(f"Saved {len(dataset)} rows to bootstrap_training_data.csv\n")

    print("Training Random Forest classifier...")
    model, encoder = train_and_save(dataset)

    print("\n--- Example inference ---")
    example = {
        "pct_python": 62.0, "pct_js_ts": 8.0, "pct_java_kotlin": 0.0,
        "pct_cpp_c": 0.0, "pct_go_rust": 0.0, "pct_sql": 12.0,
        "framework_diversity": 0.6, "project_complexity": 0.7,
        "activity_recency": 0.8, "doc_quality": 0.5,
        "has_ml_libraries": 1, "has_web_framework": 0, "has_infra_tools": 0,
        "has_mobile_framework": 0, "has_data_pipeline_tools": 0,
    }
    result = predict_role(example, clf=model, le=encoder)
    print(result)
