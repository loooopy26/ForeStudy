"""정보처리기사 공통 RAG 자료를 한 번 등록하는 운영용 시더.

컨테이너 안의 /app/backend/uploads/reference 에 아래 PDF를 둔 다음 실행한다.
같은 제목의 자료가 이미 ready 상태이면 건너뛰므로 재실행해도 안전하다.
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db import close_pool, get_pool
from services.ingest import _build_reference_alignment, ingest_material


CERTIFICATION_NAME = "정보처리기사"
REFERENCE_DIR = Path("/app/backend/uploads/reference")
REFERENCES = (
    ("2026 정보처리기사 출제기준", "3-20260713142056406.pdf", "exam_standard"),
    ("정보처리기사 2021-05-15 기출 해설", "정보처리기사20210515(해설집).pdf", "past_exam"),
    ("정보처리기사 2021-08-14 기출 해설", "정보처리기사20210814(해설집).pdf", "past_exam"),
    ("정보처리기사 2022-03-05 기출 해설", "정보처리기사20220305(해설집).pdf", "past_exam"),
    ("정보처리기사 2022-04-24 기출 해설", "정보처리기사20220424(해설집).pdf", "past_exam"),
)


async def main() -> None:
    missing = [filename for _, filename, _ in REFERENCES if not (REFERENCE_DIR / filename).is_file()]
    if missing:
        raise FileNotFoundError(f"참조 PDF를 찾지 못했습니다: {', '.join(missing)}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        system_user = await conn.fetchrow(
            """
            INSERT INTO users (email, password_hash, nickname)
            VALUES ('reference@forestudy.local', 'disabled-reference-account', '공통 자료 관리자')
            ON CONFLICT (email) DO UPDATE SET updated_at = now()
            RETURNING id
            """
        )
        certification = await conn.fetchrow(
            """
            INSERT INTO certifications (name, category, description)
            VALUES ($1, '국가기술자격', '정보처리기사 공통 출제기준 및 기출 해설 RAG 자료')
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
            """,
            CERTIFICATION_NAME,
        )

    for title, filename, reference_kind in REFERENCES:
        file_path = REFERENCE_DIR / filename
        row = await pool.fetchrow(
            """
            SELECT id, processed_status
            FROM study_materials
            WHERE title = $1 AND is_reference_material = TRUE
            """,
            title,
        )
        if row and row["processed_status"] == "ready":
            print(f"SKIP ready: {title}")
            continue

        if row is None:
            row = await pool.fetchrow(
                """
                INSERT INTO study_materials
                    (user_id, certification_id, title, file_url, file_type,
                     is_reference_material, reference_kind)
                VALUES ($1, $2, $3, $4, 'pdf', TRUE, $5)
                RETURNING id, processed_status
                """,
                system_user["id"],
                certification["id"],
                title,
                str(file_path),
                reference_kind,
            )
        else:
            await pool.execute(
                """
                UPDATE study_materials
                SET certification_id = $2, file_url = $3, file_type = 'pdf',
                    is_reference_material = TRUE, reference_kind = $4
                WHERE id = $1
                """,
                row["id"],
                certification["id"],
                str(file_path),
                reference_kind,
            )

        material_id = str(row["id"])
        print(f"INDEXING: {title}")
        await ingest_material(material_id, file_path, title)
        status = await pool.fetchval(
            "SELECT processed_status FROM study_materials WHERE id = $1", material_id
        )
        if status != "ready":
            error = await pool.fetchval(
                "SELECT processing_error FROM study_materials WHERE id = $1", material_id
            )
            raise RuntimeError(f"인덱싱 실패: {title} ({error})")
        print(f"READY: {title}")

    # 공통 자료를 등록하기 전에 이미 처리된 사용자 자료는 최초 업로드 시점에 참조할
    # 출제기준/기출 청크가 없었을 수 있다. 요약·청킹을 다시 만들 필요 없이 비교 결과만
    # 한 번 채워 넣는다. 이후 새 업로드는 ingest_material에서 자동 처리된다.
    rows = await pool.fetch(
        """
        SELECT id, title, ai_summary
        FROM study_materials
        WHERE certification_id = $1
          AND is_reference_material = FALSE
          AND processed_status = 'ready'
          AND ai_summary IS NOT NULL
          AND reference_alignment IS NULL
        """,
        certification["id"],
    )
    for row in rows:
        print("ALIGNING existing user material")
        alignment = await _build_reference_alignment(
            certification_id=str(certification["id"]),
            title=row["title"],
            summary=row["ai_summary"],
        )
        if alignment:
            await pool.execute(
                "UPDATE study_materials SET reference_alignment = $2::jsonb WHERE id = $1",
                row["id"],
                json.dumps(alignment, ensure_ascii=False),
            )
            print("ALIGNED existing user material")


async def run() -> None:
    try:
        await main()
    finally:
        # 같은 이벤트 루프 안에서 풀을 닫아 asyncpg 종료 경고를 피한다.
        await close_pool()


if __name__ == "__main__":
    asyncio.run(run())
