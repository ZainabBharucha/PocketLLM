import asyncio
import json
import time
import os
from typing import AsyncGenerator, Dict, Any, List, Optional
from fastapi import FastAPI, Request, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
import MySQLdb

# --- CONFIGURATION ---
app = FastAPI(title="PocketLLM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RESPONSE_CACHE: Dict[str, str] = {}
METRICS = {"cache_hits": 0, "cache_misses": 0, "total_requests": 0}

def get_db_connection():
    return MySQLdb.connect(
        host=os.getenv("DB_HOST", "db"),
        user=os.getenv("DB_USER", "pocket_user"),
        passwd=os.getenv("DB_PASSWORD", "pocket_password"),
        db=os.getenv("DB_NAME", "pocketllm"),
        autocommit=True
    )

class FeedbackRequest(BaseModel):
    vote: str # 'up' or 'down'

# --- HELPER: SAVE TO DB ---
def save_message_to_db(session_id: str, role: str, content: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "INSERT IGNORE INTO sessions (session_id, title) VALUES (%s, %s)",
            (session_id, content[:30] + "...")
        )
        
        cursor.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (%s, %s, %s)",
            (session_id, role, content)
        )
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"DB Error: {e}")

# --- MOCK CPU ENGINE ---
async def mock_cpu_engine(prompt: str, max_tokens: int) -> AsyncGenerator[str, None]:
    response_text = f" [CPU-Mode] You said: '{prompt}'. This is a simulated response to demonstrate the streaming architecture with feedback capabilities."
    for word in response_text.split(" "):
        yield word + " "
        await asyncio.sleep(0.05) 

# --- ENDPOINTS ---

@app.get("/metrics")
async def get_metrics():
    return METRICS

@app.put("/messages/{message_id}/feedback")
async def update_feedback(message_id: int, req: FeedbackRequest):
    """Departure: Simple feedback storage without complex taxonomy"""
    if req.vote not in ['up', 'down']:
        raise HTTPException(400, "Vote must be 'up' or 'down'")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE messages SET feedback = %s WHERE id = %s", (req.vote, message_id))
    cursor.close()
    conn.close()
    return {"status": "ok"}

@app.get("/infer")
async def infer_stream(
    request: Request,
    prompt: str, 
    session_id: str, 
    max_tokens: int = 100, 
    temperature: float = 0.7
):
    METRICS["total_requests"] += 1
    effective_max_tokens = min(max_tokens, 200)
    effective_temp = max(0.0, min(temperature, 1.0))
    
    cache_key = f"{prompt}::{effective_max_tokens}::{effective_temp}"
    
    if cache_key in RESPONSE_CACHE:
        METRICS["cache_hits"] += 1
        async def cached_generator():
            yield json.dumps({"token": RESPONSE_CACHE[cache_key], "cached": True})
        return EventSourceResponse(cached_generator())

    METRICS["cache_misses"] += 1
    save_message_to_db(session_id, "user", prompt)

    async def event_generator():
        full_response = ""
        async for token in mock_cpu_engine(prompt, effective_max_tokens):
            full_response += token
            yield json.dumps({"token": token, "cached": False})
        
        RESPONSE_CACHE[cache_key] = full_response
        save_message_to_db(session_id, "assistant", full_response)

    return EventSourceResponse(event_generator())

@app.get("/history/{session_id}")
async def get_history(session_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Updated to fetch ID and Feedback
    cursor.execute(
        "SELECT id, role, content, created_at, feedback FROM messages WHERE session_id = %s ORDER BY created_at ASC", 
        (session_id,)
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    
    # Return id and feedback in the JSON
    history = [
        {
            "id": r[0], 
            "role": r[1], 
            "content": r[2], 
            "timestamp": r[3],
            "feedback": r[4]
        } 
        for r in rows
    ]
    return history

@app.get("/sessions")
async def get_sessions():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT session_id, title, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 50")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return [{"id": r[0], "title": r[1], "date": r[2]} for r in rows]