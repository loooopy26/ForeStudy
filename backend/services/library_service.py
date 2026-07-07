"""AI 도서관 자료 분석 서비스.

담당 탭: 도서관.
역할: MVP 더미 자료 분석, 요약, 핵심 개념 추출, 추천 퀴즈 수 생성.
"""

from services import memory_store
from services.memory_store import mark_activity, materials


def analyze_material(user_id: int, material_title: str, material_type: str, content: str) -> dict:
    # MVP 더미 분석입니다. 이후 PDF/PPT/DOCX 업로드와 RAG 분석으로 교체할 예정입니다.
    material_id = memory_store.next_material_id
    memory_store.next_material_id += 1

    keywords = _extract_key_concepts(content)
    summary = f"{material_title} 자료에서 {', '.join(keywords[:3])} 중심으로 학습할 내용을 정리했습니다."

    result = {
        "material_id": material_id,
        "summary": summary,
        "key_concepts": keywords,
        "recommended_quiz_count": 5,
        "study_report": "MVP 더미 분석입니다. 이후 RAG를 연결하면 업로드 자료 기반 요약과 퀴즈를 생성합니다.",
    }

    materials[material_id] = {
        "user_id": user_id,
        "material_title": material_title,
        "material_type": material_type,
        "content": content,
        **result,
    }
    mark_activity(user_id)
    return result


def _extract_key_concepts(content: str) -> list[str]:
    # 입력 텍스트에서 간단히 중복 없는 키워드를 뽑아 핵심 개념처럼 보여줍니다.
    raw_words = [
        word.strip(" ,.\n\t")
        for word in content.replace("/", " ").replace(",", " ").split()
        if len(word.strip(" ,.\n\t")) >= 2
    ]
    concepts = list(dict.fromkeys(raw_words))[:5]
    return concepts or ["핵심 개념", "기출 유형", "오답 분석"]
