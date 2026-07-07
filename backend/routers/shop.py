from fastapi import APIRouter

from schemas import PurchaseItemRequest, PurchaseItemResponse, ShopItemResponse
from services.shop_service import get_shop_items, purchase_item

router = APIRouter(prefix="/shop", tags=["shop"])


@router.get("/items", response_model=list[ShopItemResponse])
def read_shop_items():
    return get_shop_items()


@router.post("/purchase", response_model=PurchaseItemResponse)
def purchase_shop_item(request: PurchaseItemRequest):
    return purchase_item(user_id=request.user_id, item_id=request.item_id)
