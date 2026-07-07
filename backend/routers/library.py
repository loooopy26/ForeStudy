from fastapi import APIRouter

from schemas import LibraryAnalyzeRequest, LibraryAnalyzeResponse
from services.library_service import analyze_material

router = APIRouter(prefix="/library", tags=["library"])


@router.post("/analyze", response_model=LibraryAnalyzeResponse)
def analyze_study_material(request: LibraryAnalyzeRequest):
    return analyze_material(
        user_id=request.user_id,
        material_title=request.material_title,
        material_type=request.material_type,
        content=request.content,
    )
