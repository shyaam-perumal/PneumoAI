"""Notebook-confirmed output interpretation; experimental until clinically validated."""

PNEUMONIA_THRESHOLD = 0.6
CLASS_MAPPING = {0: "Normal", 1: "Pneumonia"}


def interpret_score(score: float) -> str:
    """Convert the notebook's single sigmoid score to its confirmed binary labels."""
    label_id = 1 if score >= PNEUMONIA_THRESHOLD else 0
    return CLASS_MAPPING[label_id]
