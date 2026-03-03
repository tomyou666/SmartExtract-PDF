import json
import logging
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import litellm
from litellm import completion_cost, cost_per_token

from app.db import get_db, async_session_maker
from app.schemas.chat import SessionCreate, SessionOut, SessionUpdate, MessageOut
from app.services.llm import (
    build_litellm_messages,
    db_row_to_ui_message,
    get_llm_config,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)


def _parse_session_id(session_id: str) -> UUID:
    try:
        return UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")


def _content_str(m: dict) -> str:
    """LiteLLM message dict の content を1つの文字列にする（コスト概算用）。"""
    c = m.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return " ".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in c)
    return str(c) if c else ""


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(db: AsyncSession = Depends(get_db)) -> list[SessionOut]:
    result = await db.execute(
        text(
            "SELECT id, pdf_id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC"
        )
    )
    rows = result.mappings().all()
    return [
        SessionOut(
            id=r["id"],
            pdf_id=r["pdf_id"],
            title=r["title"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
        for r in rows
    ]


@router.post("/sessions", response_model=SessionOut)
async def create_session(
    body: SessionCreate | None = None,
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    body = body or SessionCreate()
    result = await db.execute(
        text(
            "INSERT INTO chat_sessions (pdf_id, title) VALUES (:pdf_id, :title) RETURNING id, pdf_id, title, created_at, updated_at"
        ),
        {"pdf_id": body.pdf_id, "title": body.title},
    )
    row = result.mappings().one()
    await db.commit()
    return SessionOut(
        id=row["id"],
        pdf_id=row["pdf_id"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    sid = _parse_session_id(session_id)
    result = await db.execute(
        text(
            "SELECT id, pdf_id, title, created_at, updated_at FROM chat_sessions WHERE id = :id"
        ),
        {"id": str(sid)},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionOut(
        id=row["id"],
        pdf_id=row["pdf_id"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def list_messages(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[MessageOut]:
    sid = _parse_session_id(session_id)
    result = await db.execute(
        text(
            "SELECT id, session_id, role, content_json, created_at FROM chat_messages WHERE session_id = :sid ORDER BY created_at, CASE role WHEN 'user' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END"
        ),
        {"sid": str(sid)},
    )
    rows = result.mappings().all()
    return [
        MessageOut(
            id=r["id"],
            session_id=r["session_id"],
            role=r["role"],
            content_json=r["content_json"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


def _parse_message_id(message_id: str) -> UUID:
    try:
        return UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message ID")


@router.delete("/sessions/{session_id}/messages/{message_id}", status_code=204)
async def delete_conversation_turn(
    session_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    """指定したメッセージを含む1会話（user+assistantの1ターン）を削除する。"""
    sid = _parse_session_id(session_id)
    mid = _parse_message_id(message_id)
    # セッションの存在確認
    check = await db.execute(
        text("SELECT id FROM chat_sessions WHERE id = :id"),
        {"id": str(sid)},
    )
    if check.mappings().one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session not found")
    # 対象メッセージを取得
    msg_result = await db.execute(
        text(
            "SELECT id, role FROM chat_messages WHERE id = :mid AND session_id = :sid"
        ),
        {"mid": str(mid), "sid": str(sid)},
    )
    msg_row = msg_result.mappings().one_or_none()
    if not msg_row:
        raise HTTPException(status_code=404, detail="Message not found")
    role = msg_row["role"]
    # セッション内のメッセージを created_at 順で取得（id, role のみ）
    order_result = await db.execute(
        text(
            "SELECT id, role FROM chat_messages WHERE session_id = :sid ORDER BY created_at, CASE role WHEN 'user' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END"
        ),
        {"sid": str(sid)},
    )
    ordered = list(order_result.mappings().all())
    idx = next((i for i, r in enumerate(ordered) if str(r["id"]) == str(mid)), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Message not found")
    # 削除する id のリスト: 1会話 = user + assistant のペア
    ids_to_delete = []
    if role == "user":
        ids_to_delete.append(str(ordered[idx]["id"]))
        if idx + 1 < len(ordered) and ordered[idx + 1]["role"] == "assistant":
            ids_to_delete.append(str(ordered[idx + 1]["id"]))
    else:  # assistant
        if idx - 1 >= 0 and ordered[idx - 1]["role"] == "user":
            ids_to_delete.append(str(ordered[idx - 1]["id"]))
        ids_to_delete.append(str(ordered[idx]["id"]))
    for id_val in ids_to_delete:
        await db.execute(
            text("DELETE FROM chat_messages WHERE id = :id"),
            {"id": id_val},
        )
    await db.execute(
        text("UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = :id"),
        {"id": str(sid)},
    )
    await db.commit()


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    sid = _parse_session_id(session_id)
    # セッションの存在確認
    check = await db.execute(
        text("SELECT id FROM chat_sessions WHERE id = :id"),
        {"id": str(sid)},
    )
    if check.mappings().one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session not found")
    # 関連するメッセージを削除してからセッションを削除
    await db.execute(
        text("DELETE FROM chat_messages WHERE session_id = :id"),
        {"id": str(sid)},
    )
    await db.execute(
        text("DELETE FROM chat_sessions WHERE id = :id"),
        {"id": str(sid)},
    )
    await db.commit()


@router.patch("/sessions/{session_id}", response_model=SessionOut)
async def update_session(
    session_id: str,
    body: SessionUpdate,
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    sid = _parse_session_id(session_id)
    title = body.title
    result = await db.execute(
        text(
            "UPDATE chat_sessions SET title = :title, updated_at = CURRENT_TIMESTAMP WHERE id = :id RETURNING id, pdf_id, title, created_at, updated_at"
        ),
        {"id": str(sid), "title": title},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.commit()
    return SessionOut(
        id=row["id"],
        pdf_id=row["pdf_id"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _stream_chat(session_id: str, messages: list, db: AsyncSession):
    """Yield text chunks from LiteLLM and then save messages to DB."""
    model_string, provider, api_key = await get_llm_config(db)
    sid = _parse_session_id(session_id)
    if api_key:
        env_key = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "google": "GEMINI_API_KEY",
            "gemini": "GEMINI_API_KEY",
            "groq": "GROQ_API_KEY",
        }.get(provider.lower(), "OPENAI_API_KEY")
        os.environ[env_key] = api_key
    litellm_messages = build_litellm_messages(messages)
    if not litellm_messages or (messages and messages[-1].get("role") != "user"):
        yield "No messages to send."
        return
    full_content: list[str] = []
    stream_usage = None  # usage from last chunk when stream_options include_usage
    try:
        response = await litellm.acompletion(
            model=model_string,
            messages=litellm_messages,
            stream=True,
            stream_options={"include_usage": True},
            reasoning_effort="none",
        )
        async for chunk in response:
            if getattr(chunk, "usage", None) and (
                getattr(chunk.usage, "prompt_tokens", None) is not None
                or getattr(chunk.usage, "completion_tokens", None) is not None
            ):
                stream_usage = chunk.usage
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    full_content.append(delta.content)
                    yield delta.content
    except Exception as e:
        yield f"\n[Error: {e!s}]"
        return
    # Cost logging (stream)
    assistant_text = "".join(full_content)
    try:
        if stream_usage and (
            getattr(stream_usage, "prompt_tokens", None) is not None
            or getattr(stream_usage, "completion_tokens", None) is not None
        ):
            pt = getattr(stream_usage, "prompt_tokens", 0) or 0
            ct = getattr(stream_usage, "completion_tokens", 0) or 0
            prompt_cost, completion_cost_usd = cost_per_token(
                model=model_string, prompt_tokens=pt, completion_tokens=ct
            )
            total_cost = (prompt_cost or 0) + (completion_cost_usd or 0)
            logger.info(
                "LLM cost (stream): model=%s prompt_tokens=%s completion_tokens=%s cost_usd=%.6f",
                model_string,
                pt,
                ct,
                total_cost,
            )
        else:
            cost = completion_cost(
                model=model_string,
                prompt=" ".join(_content_str(m) for m in litellm_messages),
                completion=assistant_text,
            )
            logger.info(
                "LLM cost (stream, estimated): model=%s cost_usd=%.6f",
                model_string,
                float(cost or 0),
            )
    except Exception as cost_err:
        logger.warning("LLM cost logging failed: %s", cost_err, exc_info=True)
    # Persist user (last) and assistant messages (use new session for write)
    last_msg = messages[-1] if messages else None
    content_json = {}
    if last_msg and last_msg.get("role") == "user":
        user_content = last_msg.get("parts") or last_msg.get("content") or []
        content_json = (
            {"parts": user_content}
            if isinstance(user_content, list)
            else {"text": str(user_content)}
        )
    async with async_session_maker() as write_session:
        if content_json:
            await write_session.execute(
                text(
                    "INSERT INTO chat_messages (session_id, role, content_json) VALUES (:sid, 'user', :content)"
                ),
                {"sid": str(sid), "content": json.dumps(content_json)},
            )
        await write_session.execute(
            text(
                "INSERT INTO chat_messages (session_id, role, content_json) VALUES (:sid, 'assistant', :content)"
            ),
            {"sid": str(sid), "content": json.dumps({"text": assistant_text})},
        )
        await write_session.execute(
            text(
                "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = :id"
            ),
            {"id": str(sid)},
        )
        await write_session.commit()


def _merge_messages_with_history(request_messages: list, db_rows: list) -> list:
    """Merge request messages with DB history. If client sent full history (len > 1), use it; else prepend DB history."""
    if len(request_messages) > 1:
        return request_messages
    history = [db_row_to_ui_message(r["role"], r["content_json"]) for r in db_rows]
    return history + request_messages


@router.post("/sessions/{session_id}/messages")
async def post_message_stream(
    session_id: str,
    request: dict,
    db: AsyncSession = Depends(get_db),
):
    """Stream LLM response as plain text. Body: { messages: UIMessage[] }.
    If request contains 0 or 1 message, previous messages are loaded from DB and merged so the LLM gets full context."""
    sid = _parse_session_id(session_id)
    # Verify session exists and load existing messages for context
    result = await db.execute(
        text("SELECT id FROM chat_sessions WHERE id = :id"),
        {"id": str(sid)},
    )
    if result.mappings().one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session not found")
    request_messages = request.get("messages") or []
    # Load session message history when client did not send full history
    if len(request_messages) <= 1:
        hist_result = await db.execute(
            text(
                "SELECT role, content_json FROM chat_messages WHERE session_id = :sid ORDER BY created_at, CASE role WHEN 'user' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END"
            ),
            {"sid": str(sid)},
        )
        db_rows = list(hist_result.mappings().all())
        messages = _merge_messages_with_history(request_messages, db_rows)
    else:
        messages = request_messages
    return StreamingResponse(
        _stream_chat(session_id, messages, db),
        media_type="text/plain; charset=utf-8",
    )


@router.post("/sessions/{session_id}/title")
async def generate_session_title(
    session_id: str,
    request: dict,
    db: AsyncSession = Depends(get_db),
):
    """Generate a short title from the first user message using LLM."""
    sid = _parse_session_id(session_id)
    result = await db.execute(
        text(
            "SELECT id, content_json FROM chat_messages WHERE session_id = :sid AND role = 'user' ORDER BY created_at LIMIT 1"
        ),
        {"sid": str(sid)},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="No user message in session")
    content = row["content_json"] or {}
    text_part = content.get("text") or ""
    if isinstance(content.get("parts"), list):
        for p in content["parts"]:
            if p.get("type") == "text":
                text_part = p.get("text", "")
                break
    model_string, provider, api_key = await get_llm_config(db)
    if api_key:
        env_key = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "google": "GEMINI_API_KEY",
            "gemini": "GEMINI_API_KEY",
            "groq": "GROQ_API_KEY",
        }.get(provider.lower(), "OPENAI_API_KEY")
        os.environ[env_key] = api_key
    prompt = f"Generate a very short title (under 50 characters, no quotes) for a chat that starts with: {text_part[:300]}"
    try:
        response = await litellm.acompletion(
            model=model_string,
            messages=[{"role": "user", "content": prompt}],
            stream=False,
            reasoning_effort="none",
        )
        try:
            cost = completion_cost(completion_response=response)
            logger.info(
                "LLM cost (title): model=%s cost_usd=%.6f",
                model_string,
                float(cost or 0),
            )
        except Exception as cost_err:
            logger.warning("LLM cost logging failed: %s", cost_err, exc_info=True)
        title = (
            response.choices[0].message.content.strip().strip('"')[:50]
            if response.choices
            else "新規チャット"
        )
    except Exception:
        title = "新規チャット"
    await db.execute(
        text(
            "UPDATE chat_sessions SET title = :title, updated_at = CURRENT_TIMESTAMP WHERE id = :id"
        ),
        {"id": str(sid), "title": title},
    )
    await db.commit()
    return {"title": title}
