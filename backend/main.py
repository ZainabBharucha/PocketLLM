import asyncio
import json
import time
import os
from typing import AsyncGenerator, Dict, Any, List
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
import MySQLdb

# --- CONFIGURATION ---
app = FastAPI(title="PocketLLM API")

# Allow React Frontend to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. DEPARTURE D: IN-MEMORY CACHE & METRICS ---
# Simple LRU-style dictionary for caching results
# Format: { "hashed_params": "Full response text..." }
RESPONSE_CACHE: Dict[str, str] = {}
METRICS = {"cache_hits": 0, "cache_misses": 0, "total_requests": 0}

# --- DATABASE CONNECTION ---
def get_db_connection():
    return MySQLdb.connect(
        host=os.getenv("DB_HOST", "db"),
        user=os.getenv("DB_USER", "pocket_user"),
        passwd=os.getenv("DB_PASSWORD", "pocket_password"),
        db=os.getenv("DB_NAME", "pocketllm"),
        autocommit=True
    )

# --- MODELS ---
class InferenceRequest(BaseModel):
    prompt: str
    max_tokens: int = 100
    temperature: float = 0.7
    session_id: str

# --- HELPER: SAVE TO DB (BACKGROUND TASK) ---
def save_message_to_db(session_id: str, role: str, content: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ensure session exists
        cursor.execute(
            "INSERT IGNORE INTO sessions (session_id, title) VALUES (%s, %s)",
            (session_id, content[:30] + "...")
        )
        
        # Insert message
        cursor.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (%s, %s, %s)",
            (session_id, role, content)
        )
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"DB Error: {e}")

# --- 2. DEPARTURE C: HARD-WIRED CPU RUNNER (SIMULATED) ---
async def mock_cpu_engine(prompt: str, max_tokens: int) -> AsyncGenerator[str, None]:
    """
    Simulates a CPU-only LLM by streaming tokens with a slight delay.
    In a real deployment, you would hook this into `llama-cpp-python`.
    """
    # A dummy response generator for the architecture prototype
    response_text = f" [CPU-Mode] You said: '{prompt}'. This is a generated response streaming token by token to demonstrate the architecture."
    
    # Simulate CPU latency (slow generation)
    for word in response_text.split(" "):
        yield word + " "
        await asyncio.sleep(0.1) # Simulate 100ms per token generation time

# --- ENDPOINTS ---

@app.get("/metrics")
async def get_metrics():
    """Departure E: Raw JSON Metrics"""
    return METRICS

@app.get("/infer")
async def infer_stream(
    request: Request,
    prompt: str, 
    session_id: str, 
    max_tokens: int = 100, 
    temperature: float = 0.7
):
    """
    Main SSE Endpoint. 
    Handles Clamping -> Caching -> Streaming -> Persisting.
    """
    METRICS["total_requests"] += 1
    
    # 1. Parameter Clamping (Architecture Requirement)
    effective_max_tokens = min(max_tokens, 200) # Clamp to max 200
    effective_temp = max(0.0, min(temperature, 1.0)) # Clamp 0.0-1.0
    
    # 2. Cache Key Generation (Departure D)
    # Key depends on effective params, ensuring stable hits
    cache_key = f"{prompt}::{effective_max_tokens}::{effective_temp}"
    
    # 3. Check Cache
    if cache_key in RESPONSE_CACHE:
        METRICS["cache_hits"] += 1
        print(f"CACHE HIT: {cache_key}")
        
        # Return cached result instantly (simulated stream of 1 chunk)
        async def cached_generator():
            yield json.dumps({"token": RESPONSE_CACHE[cache_key], "cached": True})
            
        return EventSourceResponse(cached_generator())

    # 4. Cache Miss -> Run Inference
    METRICS["cache_misses"] += 1
    print(f"CACHE MISS: {cache_key}")
    
    # Background: Save User Prompt
    save_message_to_db(session_id, "user", prompt)

    async def event_generator():
        full_response = ""
        
        # Stream tokens from the runner
        async for token in mock_cpu_engine(prompt, effective_max_tokens):
            full_response += token
            # Yield JSON formatted for the frontend
            yield json.dumps({"token": token, "cached": False})
        
        # 5. Populate Cache & DB after completion
        RESPONSE_CACHE[cache_key] = full_response
        save_message_to_db(session_id, "assistant", full_response)

    return EventSourceResponse(event_generator())

@app.get("/history/{session_id}")
async def get_history(session_id: str):
    """Departure F1: Simple history fetch"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT role, content, created_at FROM messages WHERE session_id = %s ORDER BY created_at ASC", 
        (session_id,)
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    
    history = [{"role": r[0], "content": r[1], "timestamp": r[2]} for r in rows]
    return history

@app.get("/sessions")
async def get_sessions():
    """Fetches list of sessions for the sidebar"""
    conn = get_db_connection()
    cursor = conn.cursor()
    # Reverse chronological order as per departure doc
    cursor.execute("SELECT session_id, title, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 50")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    
    return [{"id": r[0], "title": r[1], "date": r[2]} for r in rows]