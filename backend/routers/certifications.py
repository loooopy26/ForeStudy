"""한국산업인력공단 국가기술자격 시험정보 API 프록시."""

import asyncio
from xml.etree import ElementTree

import httpx
from fastapi import APIRouter, HTTPException, Query

from config import settings

router = APIRouter(prefix="/api/certifications", tags=["certifications"])

QUALIFICATION_LIST_URL = (
    "http://openapi.q-net.or.kr/api/service/rest/"
    "InquiryListNationalQualifcationSVC/getList"
)
TEST_INFO_BASE_URL = (
    "http://openapi.q-net.or.kr/api/service/rest/"
    "InquiryTestInformationNTQSVC"
)


def _parse_xml(xml_text: str) -> list[dict[str, str]]:
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError as exc:
        raise HTTPException(status_code=502, detail="공공데이터 응답을 해석하지 못했습니다.") from exc

    header = {child.tag: (child.text or "").strip() for child in root.findall("./header/*")}
    if header.get("resultCode") not in {None, "", "00"}:
        # Q-Net occasionally returns implementation details such as a Java
        # exception in a successful HTTP response. Do not expose those details.
        raise HTTPException(
            status_code=503,
            detail="Q-Net 시험정보 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
        )

    return [
        {child.tag: (child.text or "").strip() for child in item}
        for item in root.findall(".//items/item")
    ]


async def _request_xml(client: httpx.AsyncClient, url: str, **params: str) -> list[dict[str, str]]:
    response = await client.get(
        url,
        params={"serviceKey": settings.public_data_service_key, **params},
    )
    response.raise_for_status()
    return _parse_xml(response.text)


@router.get("/info")
async def get_certification_info(name: str = Query(..., min_length=1, max_length=100)):
    if not settings.public_data_service_key:
        raise HTTPException(status_code=503, detail="PUBLIC_DATA_SERVICE_KEY가 설정되지 않았습니다.")

    normalized_name = name.strip()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            qualifications = await _request_xml(client, QUALIFICATION_LIST_URL)
            qualification = next(
                (item for item in qualifications if item.get("jmfldnm") == normalized_name),
                None,
            )
            if qualification is None:
                raise HTTPException(
                    status_code=404,
                    detail="한국산업인력공단 국가기술자격 시험정보에서 해당 자격증을 찾지 못했습니다.",
                )

            jm_code = qualification.get("jmcd")
            if not jm_code:
                raise HTTPException(status_code=502, detail="자격증 종목코드를 확인하지 못했습니다.")

            schedules, fees = await asyncio.gather(
                _request_xml(client, f"{TEST_INFO_BASE_URL}/getJMList", jmCd=jm_code),
                _request_xml(client, f"{TEST_INFO_BASE_URL}/getFeeList", jmCd=jm_code),
            )
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503,
            detail="Q-Net 시험정보 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
        ) from exc

    return {
        "name": normalized_name,
        "code": jm_code,
        "series": qualification.get("seriesnm"),
        "category": qualification.get("obligfldnm"),
        "sub_category": qualification.get("mdobligfldnm"),
        "schedules": schedules,
        "fees": fees,
        "source_url": "https://www.data.go.kr/data/15003029/openapi.do",
    }
