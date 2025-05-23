import asyncio
import os
from datetime import datetime
from typing import Dict, List, Set

import redis
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", 6379))
        redis_db = int(os.getenv("REDIS_DB", 0))

        self.redis_client = redis.Redis(host=redis_host, port=redis_port, db=redis_db)
        self.active_connections: Dict[str, WebSocket] = {}
        self.initiated_sessions: Set[str] = set()

    def start_session(self, session_id: str):
        if not self.redis_client.sismember("initiated_sessions", session_id):
            self.redis_client.sadd("initiated_sessions", session_id)
            session_object = {
                "session_id": session_id,
                "preprocessing": "",
                "calculation": "",
                "context": "",
            }
            self.redis_client.hmset(f"session:{session_id}", session_object)

    def is_session_initiated(self, session_id: str) -> bool:
        return self.redis_client.sismember("initiated_sessions", session_id)

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[session_id] = websocket

        history = self.redis_client.lrange(f"history:{session_id}", 0, -1)
        for message in history:
            await websocket.send_text(message.decode("utf-8"))

        session_object = self.redis_client.hgetall(f"session:{session_id}")
        if session_object:
            await websocket.send_json(
                {
                    k.decode("utf-8"): v.decode("utf-8")
                    for k, v in session_object.items()
                }
            )

    def disconnect(self, session_id: str):
        self.active_connections.pop(session_id, None)

    def send_message(self, session_id: str, message: str):
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        formatted_message = f"{timestamp} - {message}"
        self.redis_client.rpush(f"history:{session_id}", formatted_message)

        websocket = self.active_connections.get(session_id)
        if websocket:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(websocket.send_text(formatted_message))

    def update_session_object(self, session_id: str, key: str, value: str):
        self.redis_client.hset(f"session:{session_id}", key, value)
        self.send_session_object(session_id)

    def send_session_object(self, session_id: str):
        session_object = self.redis_client.hgetall(f"session:{session_id}")
        if session_object:
            websocket = self.active_connections.get(session_id)
            if websocket:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(
                    websocket.send_json(
                        {
                            k.decode("utf-8"): v.decode("utf-8")
                            for k, v in session_object.items()
                        }
                    )
                )

    def remove_session_data(self, session_id: str):
        self.redis_client.srem("initiated_sessions", session_id)
        self.redis_client.delete(f"history:{session_id}")
        self.redis_client.delete(f"session:{session_id}")


manager = ConnectionManager()
