from __future__ import annotations
from models import TransformType
from transforms.library import clean, reshape, datetime_transforms, enrich, aggregate, string_transforms, custom_sql

# Build registry from all library modules
_ALL_TRANSFORMS: list[TransformType] = (
    clean.ALL_TRANSFORMS
    + reshape.ALL_TRANSFORMS
    + datetime_transforms.ALL_TRANSFORMS
    + enrich.ALL_TRANSFORMS
    + aggregate.ALL_TRANSFORMS
    + string_transforms.ALL_TRANSFORMS
    + custom_sql.ALL_TRANSFORMS
)

REGISTRY: dict[str, TransformType] = {t.id: t for t in _ALL_TRANSFORMS}


def get_transform(id: str) -> TransformType:
    if id not in REGISTRY:
        raise ValueError(f"Unknown transform type: {id!r}")
    return REGISTRY[id]


def list_transforms() -> list[TransformType]:
    return list(REGISTRY.values())


def list_by_category(category: str) -> list[TransformType]:
    return [t for t in REGISTRY.values() if t.category == category]
