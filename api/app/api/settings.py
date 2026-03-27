"""Settings API routes.

LLM configuration routes have been moved to chat.py to avoid route conflicts.
This module remains for future non-LLM settings if needed.
"""

from fastapi import APIRouter

router = APIRouter()
