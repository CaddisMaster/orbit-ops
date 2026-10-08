"""The curriculum: file schema, loader and the read-only Catalog."""

from fastapi import Request

from app.content.loader import CONTENT_DIR, Catalog, ContentError, Module, Track, Unit, load_catalog

__all__ = ["CONTENT_DIR", "Catalog", "ContentError", "Module", "Track", "Unit", "get_catalog", "load_catalog"]


def get_catalog(request: Request) -> Catalog:
    """FastAPI dependency. The catalog is loaded once at startup (app.main's
    lifespan) and is immutable, so every request shares the same object."""
    return request.app.state.catalog
