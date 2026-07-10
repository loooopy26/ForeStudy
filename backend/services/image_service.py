"""AI 아이템 이미지 생성 클라이언트 (Solar 프롬프트 변환 + Pollinations.ai 이미지 생성 + 배경 투명화).

- 1단계: Solar Chat으로 사용자의 한국어 입력을 이미지 생성용 영어 묘사 문장으로 변환
- 2단계: 고정 화풍(STYLE_SUFFIX)을 붙여 Pollinations.ai(FLUX)로 이미지 생성
- 3단계: 흰색 배경 픽셀을 투명하게 만들어 PNG 바이트로 반환 (아이템 스티커처럼 쓰기 위함)

Pollinations.ai는 가입/API 키 없이 URL 요청만으로 이미지를 생성해주는 무료 서비스라
테스트/MVP 단계에 쓴다. SLA가 없어 실제 서비스 단계에서는 fal.ai 등 유료 API로
generate_image()만 교체하면 된다 (인터페이스는 그대로 유지).

주의: 생성된 아이템들이 방 안에 한꺼번에 놓이므로 화풍이 아이템마다 달라지면 안 된다.
그래서 STYLE_SUFFIX는 사용자 입력이 절대 건드리지 못하게 항상 코드에서 고정으로 이어붙인다.
같은 이유로 배경은 항상 'plain white background'로 고정 요청하고, 그 흰 배경만 투명화한다
(임의 배경이면 단순 임계값 방식으로는 투명화가 불가능하기 때문).
"""

import hashlib
import io
from urllib.parse import quote

import httpx
from PIL import Image

from services.upstage import chat

_POLLINATIONS_BASE_URL = "https://image.pollinations.ai/prompt"
_WHITE_THRESHOLD = 235  # 이 값 이상인 R/G/B는 배경으로 간주해 투명 처리

IMAGE_PROMPT_SYSTEM = """당신은 게임 아이템 이미지 생성을 위한 프롬프트 엔지니어입니다.
사용자가 한국어로 설명한 아이템/방 꾸미기 소품 설명을 받아,
이미지 생성 AI(FLUX)에 넣을 영어 프롬프트의 '주제 묘사 부분'만 작성합니다.

규칙:
- 출력은 영어 한 문장, 15~25단어 내외로 작성
- 색상, 재질, 형태, 분위기 등 시각적 특징 위주로 구체적으로 묘사
- 화풍, 배경, 워터마크 관련 문구는 절대 포함하지 마세요 (코드에서 별도로 고정 삽입됩니다)
- 사람 얼굴, 폭력적/선정적 요소, 특정 브랜드 로고, 문자/텍스트가 포함된 요청은
  안전하고 게임에 어울리는 대체 묘사로 순화해서 반환하세요
- 이미지 생성 프롬프트 문장 외의 다른 설명, 인사말, 따옴표는 절대 출력하지 마세요"""

STYLE_SUFFIX = (
    "cute flat-vector game item icon, pastel color palette, soft cel-shading, "
    "thick clean outline, centered composition, plain white background, "
    "no text, no watermark, sticker style, isometric-friendly"
)


def _seed_for(prompt: str) -> int:
    # 같은 프롬프트는 같은 seed를 쓰도록 해시로 고정 (재생성 시 결과가 크게 안 튀도록)
    return int(hashlib.sha256(prompt.encode()).hexdigest(), 16) % (2**31)


async def build_image_prompt(user_input: str) -> str:
    """사용자의 한국어 입력을 화풍이 고정된 최종 영어 이미지 생성 프롬프트로 변환한다."""
    description = await chat(
        [
            {"role": "system", "content": IMAGE_PROMPT_SYSTEM},
            {
                "role": "user",
                "content": f"사용자 입력: {user_input}\n"
                "위 입력을 바탕으로 이미지 생성용 영어 묘사 문장을 한 줄로 작성해줘.",
            },
        ],
        temperature=0.5,
    )
    return f"{description.strip()}, {STYLE_SUFFIX}"


def _strip_white_background(image_bytes: bytes) -> bytes:
    """흰색에 가까운 픽셀을 투명하게 바꾼 PNG 바이트를 반환한다.
    프롬프트가 항상 'plain white background'를 강제하므로 단순 임계값 방식으로 충분하다."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    pixels = image.getdata()
    transparent_pixels = [
        (r, g, b, 0) if r >= _WHITE_THRESHOLD and g >= _WHITE_THRESHOLD and b >= _WHITE_THRESHOLD else (r, g, b, a)
        for r, g, b, a in pixels
    ]
    image.putdata(transparent_pixels)

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


async def generate_image(prompt: str) -> bytes:
    """Pollinations.ai(FLUX)로 이미지를 생성하고, 배경을 투명화한 PNG 바이트를 반환한다.

    Pollinations는 가끔 200 OK에 빈 본문(생성 실패가 캐시된 상태)을 돌려주는 경우가
    있어(관측됨), 상태 코드만으로는 성공을 신뢰할 수 없다. 그래서 실제 바이트 수까지
    확인하고, 비어 있으면 seed를 바꿔 한 번 더 시도한다."""
    base_seed = _seed_for(prompt)

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        for attempt in range(2):
            seed = base_seed + attempt
            url = (
                f"{_POLLINATIONS_BASE_URL}/{quote(prompt)}"
                f"?width=512&height=512&nologo=true&model=flux&seed={seed}"
            )
            resp = await client.get(url)
            resp.raise_for_status()
            if len(resp.content) > 0:
                return _strip_white_background(resp.content)

    raise RuntimeError("Pollinations가 빈 이미지를 반환했습니다 (재시도 후에도 실패)")


async def generate_item_image(user_input: str) -> tuple[str, bytes]:
    """(최종 이미지 프롬프트, 배경 투명화된 PNG 바이트) 튜플을 반환한다."""
    prompt = await build_image_prompt(user_input)
    image_bytes = await generate_image(prompt)
    return prompt, image_bytes
