"""目次（TOC）のJSON形式。LLMの構造化出力で使用する。"""

from pydantic import BaseModel, Field


class TocItem(BaseModel):
    """目次1項目。"""

    title: str = Field(description="見出しタイトル")
    page: int = Field(ge=1, description="ページ番号（1始まり）")
    level: int = Field(ge=1, le=6, description="階層レベル（1=章, 2=節, 3=項...）")


class TocResponse(BaseModel):
    """目次全体。LLMはこの形式で返す。"""

    items: list[TocItem] = Field(default_factory=list, description="目次項目のリスト")
