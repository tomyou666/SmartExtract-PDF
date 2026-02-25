from datetime import datetime

from pydantic import BaseModel


class PdfCreate(BaseModel):
    pass  # file comes from multipart form


class PdfOut(BaseModel):
    id: int
    filename: str
    created_at: datetime

    model_config = {"from_attributes": True}
