"""Encrypted artifact storage shared by the API and evaluation worker."""

from __future__ import annotations

import os
import tempfile
from collections.abc import Callable
from pathlib import Path, PurePosixPath
from typing import Protocol


class ArtifactStore(Protocol):
    def read(self, relative_uri: str) -> bytes: ...

    def write_immutable(self, relative_uri: str, content: bytes) -> None: ...

    def exists(self, relative_uri: str) -> bool: ...


class LocalArtifactStore:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def _path(self, relative_uri: str) -> Path:
        path = (self.root / _safe_key(relative_uri)).resolve()
        try:
            path.relative_to(self.root)
        except ValueError:
            raise RuntimeError("An artifact path is invalid.") from None
        return path

    def read(self, relative_uri: str) -> bytes:
        return self._path(relative_uri).read_bytes()

    def write_immutable(self, relative_uri: str, content: bytes) -> None:
        path = self._path(relative_uri)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(prefix=".artifact-", dir=path.parent)
        try:
            with os.fdopen(fd, "wb") as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
            try:
                os.link(temporary_name, path)
            except FileExistsError:
                if path.read_bytes() != content:
                    raise RuntimeError(
                        "An immutable artifact already exists with different content."
                    ) from None
        finally:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass

    def exists(self, relative_uri: str) -> bool:
        return self._path(relative_uri).is_file()


class S3ArtifactStore:
    """S3-compatible private object store (Cloudflare R2) with immutable writes."""

    def __init__(self, *, endpoint_url: str, bucket: str, prefix: str = ""):
        try:
            import boto3  # type: ignore[import-untyped]
            from botocore.config import Config  # type: ignore[import-untyped]
        except ImportError as error:
            raise RuntimeError("S3 artifact storage requires the boto3 package.") from error
        access_key = os.getenv("FISHEYE_R2_ACCESS_KEY_ID", "").strip()
        secret_key = os.getenv("FISHEYE_R2_SECRET_ACCESS_KEY", "").strip()
        if not access_key or not secret_key:
            raise RuntimeError("R2 artifact credentials are not configured.")
        self.bucket = bucket
        self.prefix = _safe_prefix(prefix)
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 4}),
        )

    def _key(self, relative_uri: str) -> str:
        relative = _safe_key(relative_uri)
        return f"{self.prefix}/{relative}" if self.prefix else relative

    def read(self, relative_uri: str) -> bytes:
        from botocore.exceptions import ClientError  # type: ignore[import-untyped]

        try:
            response = self.client.get_object(Bucket=self.bucket, Key=self._key(relative_uri))
            return bytes(response["Body"].read())
        except ClientError as error:
            raise RuntimeError("An artifact could not be read from object storage.") from error

    def write_immutable(self, relative_uri: str, content: bytes) -> None:
        key = self._key(relative_uri)
        try:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=content, IfNoneMatch="*")
        except Exception as error:
            from botocore.exceptions import ClientError

            if (
                not isinstance(error, ClientError)
                or error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 412
            ):
                raise
            if self.read(relative_uri) != content:
                raise RuntimeError(
                    "An immutable artifact already exists with different content."
                ) from None

    def exists(self, relative_uri: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.client.head_object(Bucket=self.bucket, Key=self._key(relative_uri))
        except ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
                return False
            raise RuntimeError("Artifact storage availability could not be checked.") from error
        return True


def artifact_store_from_environment() -> ArtifactStore:
    backend = os.getenv("FISHEYE_ARTIFACT_STORAGE", "local").strip().lower()
    if backend == "local":
        root = os.getenv("FISHEYE_ARTIFACT_DIR", "").strip()
        if not root:
            raise RuntimeError("FISHEYE_ARTIFACT_DIR is required for local artifact storage.")
        return LocalArtifactStore(Path(root))
    if backend == "r2":
        endpoint = os.getenv("FISHEYE_R2_ENDPOINT_URL", "").strip()
        bucket = os.getenv("FISHEYE_R2_BUCKET", "").strip()
        if not endpoint or not bucket:
            raise RuntimeError("R2 artifact endpoint and bucket are not configured.")
        return S3ArtifactStore(
            endpoint_url=endpoint, bucket=bucket, prefix=os.getenv("FISHEYE_R2_PREFIX", "fisheye")
        )
    raise RuntimeError("FISHEYE_ARTIFACT_STORAGE must be 'local' or 'r2'.")


def as_artifact_store(value: ArtifactStore | Path) -> ArtifactStore:
    if isinstance(value, Path):
        return LocalArtifactStore(value)
    return value


def write_encrypted_immutable(
    store: ArtifactStore,
    relative_uri: str,
    plaintext: bytes,
    *,
    encrypt: Callable[[bytes], bytes],
    decrypt: Callable[[bytes], bytes],
) -> None:
    """Create-once an encrypted object while treating randomized ciphertext as equivalent."""
    if store.exists(relative_uri):
        if decrypt(store.read(relative_uri)) != plaintext:
            raise RuntimeError("An immutable artifact already exists with different content.")
        return
    try:
        store.write_immutable(relative_uri, encrypt(plaintext))
    except Exception:
        # A concurrent writer may have committed equivalent plaintext under a different Fernet
        # nonce. Reuse only after decrypting and comparing the winner's exact plaintext.
        if store.exists(relative_uri) and decrypt(store.read(relative_uri)) == plaintext:
            return
        raise


def _safe_key(value: str) -> str:
    path = PurePosixPath(value.replace("\\", "/"))
    if not value or path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise RuntimeError("An artifact path is invalid.")
    return path.as_posix()


def _safe_prefix(value: str) -> str:
    if not value:
        return ""
    return _safe_key(value.rstrip("/"))
