"""AI 도서관 API 라우터.

담당 탭: 도서관 화면, 학습 자료 분석, 요약/핵심 개념/추천 퀴즈 수 제공.
주요 API: POST /library/analyze
"""

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
