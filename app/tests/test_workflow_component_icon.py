"""
The ``workflow_component.icon`` URL field and the storage behind it.

An icon is a PNG: the publish route writes it to object storage (production) or
disk (development) and keeps only the public URL on the row. An author may also
give a link instead, which lands in the same column. These tests cover
validation, both backends, and what the row ends up holding.
"""
# Standard library imports
import base64
import uuid

# Third-party imports
import pytest
from pydantic import ValidationError

# Local application imports
from app.core.config import settings
from app.models import (
    ICON_MAX_BYTES,
    ICON_MAX_CHARS,
    WorkflowComponent,
    WorkflowComponentPublishIn,
    WorkflowComponentPublic,
    split_icon,
)
from app.services import icon_storage

# A real PNG signature, because the field checks for one.
PNG = b"\x89PNG\r\n\x1a\n" + b"pretend png bytes"
DATA_ICON = f"data:image/png;base64,{base64.b64encode(PNG).decode('ascii')}"
URL_ICON = "https://example.com/icons/sum.png"
SVG_ICON = f"data:image/svg+xml;base64,{base64.b64encode(b'<svg/>').decode('ascii')}"
JPEG_ICON = (
    f"data:image/jpeg;base64,{base64.b64encode(bytes([0xFF, 0xD8, 0xFF])).decode('ascii')}"
)
NOT_PNG_ICON = (
    f"data:image/png;base64,{base64.b64encode(b'not a png at all').decode('ascii')}"
)


def publish(**extra):
    """
    Build a publish payload, overriding any field via ``extra``.
    """
    return WorkflowComponentPublishIn.model_validate(
        {"name": "sum-two-number", "version": 1, **extra}
    )


def row(**extra):
    """
    A component row that was never saved, so nothing here needs a database.
    """
    return WorkflowComponent(
        name="sum-two-number",
        owner_id=uuid.uuid4(),
        version=1,
        snapshot_workflow_id=uuid.uuid4(),
        **extra,
    )


def test_icon_column_holds_a_url():
    columns = WorkflowComponent.__table__.columns
    assert columns["icon"].nullable is True
    assert columns["icon"].type.length == 2048
    # There is no second column: a stored image and a pasted link are one thing.
    assert "icon_url" not in columns
    assert "icon_content_type" not in columns


def test_icons_default_to_none():
    assert publish().icon is None
    assert publish(icon=None).icon is None
    # An empty form field means "no icon" rather than an error.
    assert publish(icon="").icon is None
    assert split_icon("   ") == (None, None)


def test_inline_png_is_decoded():
    assert split_icon(DATA_ICON) == (PNG, None)
    # The publish payload keeps the string the form sent; the route splits it.
    assert publish(icon=DATA_ICON).icon == DATA_ICON


def test_link_is_kept_as_a_link():
    assert split_icon(URL_ICON) == (None, URL_ICON)
    assert split_icon("  " + URL_ICON + "  ") == (None, URL_ICON)


@pytest.mark.parametrize(
    "bad",
    [
        "javascript:alert(1)",
        "ftp://example.com/i.png",
        "/static/icons/sum.png",
        "sum.png",
        # Other image types are refused, not converted: an SVG served from the
        # media prefix would run in the application's own origin.
        SVG_ICON,
        JPEG_ICON,
        "data:image/png;base64,not base64!!",
        NOT_PNG_ICON,  # bytes without the PNG signature are not a PNG
        # Over the character cap before it is even decoded.
        "data:image/png;base64," + "A" * ICON_MAX_CHARS,
    ],
)
def test_rejected_icons(bad):
    with pytest.raises(ValidationError):
        publish(icon=bad)
    with pytest.raises(ValueError):
        split_icon(bad)


def test_rejects_a_png_over_the_byte_cap():
    oversized = base64.b64encode(PNG + b"x" * (ICON_MAX_BYTES + 1)).decode("ascii")
    with pytest.raises(ValidationError):
        publish(icon=f"data:image/png;base64,{oversized}")
    with pytest.raises(ValueError):
        split_icon(f"data:image/png;base64,{oversized}")


def test_local_backend_writes_a_file_and_returns_its_url(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ICON_STORAGE", "local")
    monkeypatch.setattr(settings, "ICON_LOCAL_PATH", str(tmp_path))
    monkeypatch.setattr(settings, "ICON_URL_PREFIX", "/media")

    url = icon_storage.save_icon(PNG)

    assert url.startswith("/media/component-icons/") and url.endswith(".png")
    stored = tmp_path / url.split("/media/", 1)[1]
    assert stored.read_bytes() == PNG


def test_s3_backend_uploads_the_object_and_returns_its_url(monkeypatch):
    monkeypatch.setattr(settings, "ICON_STORAGE", "s3")
    monkeypatch.setattr(settings, "S3_BUCKET", "genalima-icons")
    monkeypatch.setattr(settings, "S3_REGION", "eu-west-1")
    monkeypatch.setattr(settings, "S3_PUBLIC_BASE_URL", "")

    calls = []

    class FakeS3:
        def put_object(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr(icon_storage, "_s3_client", lambda: FakeS3())

    url = icon_storage.save_icon(PNG)

    assert calls == [
        {
            "Bucket": "genalima-icons",
            "Key": "component-icons/"
            + url.rsplit("/", 1)[1],
            "Body": PNG,
            "ContentType": "image/png",
            "CacheControl": icon_storage.ICON_CACHE_CONTROL,
        }
    ]
    assert url.startswith("https://genalima-icons.s3.eu-west-1.amazonaws.com/")
    assert calls[0]["Key"] in url


def test_s3_public_base_url_wins(monkeypatch):
    monkeypatch.setattr(settings, "ICON_STORAGE", "s3")
    monkeypatch.setattr(settings, "S3_BUCKET", "genalima-icons")
    monkeypatch.setattr(settings, "S3_PUBLIC_BASE_URL", "https://cdn.example.com/icons/")

    assert icon_storage.icon_url("component-icons/a.png") == (
        "https://cdn.example.com/icons/component-icons/a.png"
    )


def test_s3_without_a_bucket_is_an_error(monkeypatch):
    monkeypatch.setattr(settings, "ICON_STORAGE", "s3")
    monkeypatch.setattr(settings, "S3_BUCKET", "")

    with pytest.raises(icon_storage.IconStorageError):
        icon_storage.save_icon(PNG)


def test_default_backend_follows_the_environment(monkeypatch):
    monkeypatch.setattr(settings, "ICON_STORAGE", "")
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert settings.icon_storage == "s3"

    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    assert settings.icon_storage == "local"


def test_the_row_and_the_response_hold_the_same_url():
    component = row(icon=URL_ICON)

    # A URL needs no translation on the way out, and nothing leaks with it.
    public = WorkflowComponentPublic.model_validate(component.model_dump())
    assert public.icon == URL_ICON
    assert public.model_dump().keys() == WorkflowComponentPublic.model_fields.keys()
    assert WorkflowComponentPublic.model_validate(row().model_dump()).icon is None
