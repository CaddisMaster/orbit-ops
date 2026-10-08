"""The curriculum pages: the syllabus and individual modules."""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse

from app.content import Catalog, get_catalog
from app.models import User
from app.security import require_user
from app.templating import templates

router = APIRouter()


@router.get("/syllabus", response_class=HTMLResponse)
def syllabus(request: Request, user: User = Depends(require_user), catalog: Catalog = Depends(get_catalog)):
    return templates.TemplateResponse(request, "syllabus.html", {"user": user, "catalog": catalog})


@router.get("/modules/{slug}", response_class=HTMLResponse)
def module_page(
    slug: str, request: Request, user: User = Depends(require_user), catalog: Catalog = Depends(get_catalog)
):
    module = catalog.modules.get(slug)
    if module is None:
        raise HTTPException(status_code=404)
    unit = catalog.units[module.unit]
    track = next(t for t in catalog.tracks if t.slug == module.track)
    return templates.TemplateResponse(
        request,
        "module.html",
        {"user": user, "module": module, "unit": unit, "track": track, "unit_size": len(unit.modules)},
    )
