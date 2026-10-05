"""
Component icon storage.

Icons are PNGs kept out of the database: written to disk in development, to S3
in production and staging. `save_icon` returns the public URL of what it stored,
and that URL is all the component row keeps — the image is never in Postgres, and
a node copied from a component carries the same URL.

Icons are never deleted with their component: the URL travels inside any graph
that copied the component, so the object has to outlive the row for those copies
to keep rendering. A bucket lifecycle rule can prune unreferenced objects if the
accumulation ever matters — they are a few kilobytes each.
"""
# Standard library imports
from pathlib import Path
import uuid

# Local application imports
from app.core.config import settings

PNG_CONTENT_TYPE = "image/png"
"""The only image type stored, so nothing scriptable can ever be served."""

ICON_KEY_PREFIX = "component-icons"
"""Folder inside the bucket or the local media root that holds every icon."""

ICON_CACHE_CONTROL = "public, max-age=31536000, immutable"
"""Icons are immutable — a new version mints a new key — so cache them hard."""


class IconStorageError(RuntimeError):
    """The icon could not be written. The caller turns this into a 5xx."""


def new_icon_key() -> str:
    """
    A fresh, unguessable key for one icon.
    """
    return f"{ICON_KEY_PREFIX}/{uuid.uuid4().hex}.png"


def _s3_client():
    """
    A boto3 S3 client.

    Imported here rather than at module scope so local development needs no AWS
    SDK, and configured entirely from the environment: region, an optional
    endpoint for MinIO/LocalStack, and whatever credentials the standard chain
    finds.
    """
    import boto3

    return boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        endpoint_url=settings.S3_ENDPOINT_URL or None,
    )


def icon_url(key: str) -> str:
    """
    The public URL a browser loads one stored icon from.
    """
    if settings.icon_storage == "s3":
        base = settings.S3_PUBLIC_BASE_URL or (
            f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com"
        )
        return f"{base.rstrip('/')}/{key.lstrip('/')}"
    # Relative, so the app can be served from any host: the API serves this
    # prefix in production, and the Vite dev server proxies it to the API.
    return f"{settings.ICON_URL_PREFIX.rstrip('/')}/{key.lstrip('/')}"


def save_icon(image: bytes) -> str:
    """
    Store one PNG and return its public URL, which is what the row keeps.

    Raises `IconStorageError` rather than leaking a backend failure, so the
    publish route can fail cleanly before anything is committed.
    """
    key = new_icon_key()
    if settings.icon_storage == "s3":
        if not settings.S3_BUCKET:
            raise IconStorageError("S3_BUCKET is not configured")
        try:
            _s3_client().put_object(
                Bucket=settings.S3_BUCKET,
                Key=key,
                Body=image,
                ContentType=PNG_CONTENT_TYPE,
                CacheControl=ICON_CACHE_CONTROL,
            )
        except Exception as exc:  # pragma: no cover - depends on the backend
            raise IconStorageError(str(exc)) from exc
        return icon_url(key)

    path = Path(settings.ICON_LOCAL_PATH) / key
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(image)
    except OSError as exc:
        raise IconStorageError(str(exc)) from exc
    return icon_url(key)
