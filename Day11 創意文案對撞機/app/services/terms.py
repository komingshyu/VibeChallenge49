import json, os, random
from typing import List

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "lexicon.json")

def load_terms() -> List[str]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [item["term"] for item in data]

def sample_terms(k: int = 20, seed: int | None = None) -> List[str]:
    all_terms = load_terms()
    rng = random.Random(seed)
    return rng.sample(all_terms, k=min(k, len(all_terms)))
