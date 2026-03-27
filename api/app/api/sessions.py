"""Session API routes — placeholder for direct API access."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/sessions")
async def list_sessions():
    return {"message": "Sessions managed by frontend Prisma layer."}
