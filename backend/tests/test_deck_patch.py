from app.services.deck_patch import extract_patch


def test_extract_patch_from_fenced_json():
    text = """可以这样改：

```json
{"ops":[{"op":"set_count","card_id":"1001","count":2}]}
```
"""
    patch = extract_patch(text)
    assert patch is not None
    assert patch["ops"][0]["card_id"] == "1001"


def test_extract_patch_missing():
    assert extract_patch("只是建议，先补解场。") is None
