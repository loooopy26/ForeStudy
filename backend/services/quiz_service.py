"""AI 퀴즈 생성/채점 서비스.

담당 탭: AI 퀴즈.
역할: 더미 문제 생성, 제출 답안 자동 채점, 퀴즈 보상 지급.
"""

from fastapi import HTTPException

from services import memory_store
from services.memory_store import mark_activity, quiz_results, quiz_sets
from services.reward_service import add_reward

QUESTION_BANK = [
    {
        "question": "정보처리기사 필기 시험에서 소프트웨어 설계 영역에 해당하는 내용은?",
        "choices": ["요구사항 확인", "네트워크 장비 교체", "회계 결산", "마케팅 전략"],
        "answer": "요구사항 확인",
    },
    {
        "question": "데이터베이스에서 중복을 줄이고 이상 현상을 방지하기 위한 설계 과정은?",
        "choices": ["정규화", "컴파일", "렌더링", "캐싱"],
        "answer": "정규화",
    },
    {
        "question": "HTTP 상태 코드 200이 의미하는 것은?",
        "choices": ["요청 성공", "권한 없음", "서버 오류", "리소스 없음"],
        "answer": "요청 성공",
    },
    {
        "question": "API 서버에서 요청과 응답 데이터 구조를 검증하는 데 쓰는 것은?",
        "choices": ["스키마", "색상표", "폰트", "이미지"],
        "answer": "스키마",
    },
    {
        "question": "Git에서 변경 사항을 저장소 기록으로 남기는 명령은?",
        "choices": ["commit", "paint", "sleep", "launch"],
        "answer": "commit",
    },
]


def generate_quiz(user_id: int, goal_id: int, count: int) -> dict:
    # MVP에서는 고정 문제 은행에서 퀴즈를 생성합니다.
    # 추후 AI 도서관 분석 결과나 RAG 결과를 기반으로 문제를 생성하도록 교체할 수 있습니다.
    quiz_id = memory_store.next_quiz_id
    memory_store.next_quiz_id += 1

    selected = QUESTION_BANK[:count]
    questions = [
        {
            "question_id": index + 1,
            "question": item["question"],
            "choices": item["choices"],
        }
        for index, item in enumerate(selected)
    ]

    quiz_sets[quiz_id] = {
        "quiz_id": quiz_id,
        "user_id": user_id,
        "goal_id": goal_id,
        "questions": selected,
    }
    mark_activity(user_id)
    return {"quiz_id": quiz_id, "user_id": user_id, "goal_id": goal_id, "questions": questions}


def submit_quiz(user_id: int, quiz_id: int, answers: list) -> dict:
    # 사용자가 제출한 답안을 정답과 비교해 점수, 합격 여부, 보상을 계산합니다.
    if quiz_id not in quiz_sets:
        raise HTTPException(status_code=404, detail="Quiz not found")

    quiz = quiz_sets[quiz_id]
    answer_map = {answer.question_id: answer.selected_choice for answer in answers}
    correct_count = 0

    for index, question in enumerate(quiz["questions"], start=1):
        if answer_map.get(index) == question["answer"]:
            correct_count += 1

    total_questions = len(quiz["questions"])
    score_percent = round((correct_count / total_questions) * 100, 2) if total_questions else 0
    reward_token = 20 if score_percent >= 60 else 5
    passed = score_percent >= 60

    result = {
        "quiz_id": quiz_id,
        "user_id": user_id,
        "total_questions": total_questions,
        "correct_count": correct_count,
        "score_percent": score_percent,
        "reward_token": reward_token,
        "passed": passed,
    }
    quiz_results.append(result)

    achievement = "퀴즈 고득점 달성" if score_percent >= 80 else "첫 퀴즈 완료"
    add_reward(user_id, reward_token, achievement)
    mark_activity(user_id)
    return result
