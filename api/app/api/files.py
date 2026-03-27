"""Static file serving for sandbox-generated files (charts, etc.)."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

# Only serve files under this prefix
ALLOWED_ROOT = Path("/tmp/data_agent")


@router.get("/files/{file_path:path}")
async def serve_file(file_path: str):
    """Serve sandbox-generated files with path traversal protection."""
    # Block path traversal
    if ".." in file_path:
        raise HTTPException(status_code=403, detail="Path traversal not allowed")

    full_path = ALLOWED_ROOT / file_path
    # Resolve and re-check prefix to block symlink escapes
    resolved = full_path.resolve()
    if not str(resolved).startswith(str(ALLOWED_ROOT.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")

    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(resolved)
