"""Object storage for product pictures and designs, always MinIO (no silent local-disk substitute).

Files are always served back through the API (``/api/v1/media/<key>``) so the bucket can stay private.
"""

import asyncio
import io
import logging

from app.core.config import settings
from app.core.errors import ServiceUnavailableError

logger = logging.getLogger(__name__)



class StorageUnavailable(ServiceUnavailableError):
    """Raised when MinIO is not configured or cannot be reached (HTTP 503)."""

_client = None
_ready = False


def _minio():
    global _client, _ready
    if not settings.MINIO_ENDPOINT or not settings.MINIO_ACCESS_KEY:
        return None
    if _client is None:
        from minio import Minio

        _client = Minio(settings.MINIO_ENDPOINT, access_key=settings.MINIO_ACCESS_KEY, secret_key=settings.MINIO_SECRET_KEY, secure=settings.MINIO_SECURE)
    if not _ready:
        if not _client.bucket_exists(settings.MINIO_BUCKET):
            _client.make_bucket(settings.MINIO_BUCKET)
        _ready = True
    return _client


def _put(key: str, data: bytes, content_type: str) -> str:
    client = _minio()
    if client is None:
        raise StorageUnavailable("Object storage is not configured (set MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY).")
    try:
        client.put_object(settings.MINIO_BUCKET, key, io.BytesIO(data), len(data), content_type=content_type)
    except Exception as exc:  # noqa: BLE001
        logger.error("MinIO write failed for %s: %s", key, exc)
        raise StorageUnavailable("Picture storage is unavailable right now. Nothing was saved; please try again.") from exc
    return "minio"


def _get(key: str) -> tuple[bytes, str] | None:
    client = _minio()
    if client is None:
        raise StorageUnavailable("Object storage is not configured.")
    try:
        res = client.get_object(settings.MINIO_BUCKET, key)
    except Exception as exc:  # noqa: BLE001
        code = getattr(exc, "code", "")
        if code in ("NoSuchKey", "NoSuchBucket"):
            return None
        logger.error("MinIO read failed for %s: %s", key, exc)
        raise StorageUnavailable("Picture storage is unavailable right now.") from exc
    try:
        return res.read(), res.headers.get("Content-Type", "application/octet-stream")
    finally:
        res.close()
        res.release_conn()


async def save_media(key: str, data: bytes, content_type: str) -> str:
    await asyncio.to_thread(_put, key, data, content_type)
    return f"/api/v1/media/{key}"


async def load_media(key: str) -> tuple[bytes, str] | None:
    return await asyncio.to_thread(_get, key)


def make_thumbnail(data: bytes, design: bool = False, size: int = 480) -> bytes:
    """Square-ish WebP thumbnail for shop cards. Designer exports hold front and back side by side, so the card shows the front."""
    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("RGBA")
    if design and img.width >= img.height * 1.8:
        img = img.crop((0, 0, img.width // 2, img.height))
    bg = Image.new("RGBA", img.size, (245, 245, 245, 255))
    bg.alpha_composite(img)
    thumb = ImageOps.fit(bg.convert("RGB"), (size, size), method=Image.LANCZOS, centering=(0.5, 0.5))
    out = io.BytesIO()
    thumb.save(out, format="WEBP", quality=82)
    return out.getvalue()
