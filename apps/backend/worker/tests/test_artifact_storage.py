from __future__ import annotations

import io

import boto3
import pytest
from botocore.exceptions import ClientError
from cryptography.fernet import Fernet
from fisheye_persistence.artifacts import (
    S3ArtifactStore,
    write_encrypted_immutable,
)


class FakeS3:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, IfNoneMatch: str):
        assert IfNoneMatch == "*"
        object_key = (Bucket, Key)
        if object_key in self.objects:
            raise ClientError(
                {
                    "Error": {"Code": "PreconditionFailed"},
                    "ResponseMetadata": {"HTTPStatusCode": 412},
                },
                "PutObject",
            )
        self.objects[object_key] = Body

    def get_object(self, *, Bucket: str, Key: str):
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def head_object(self, *, Bucket: str, Key: str):
        if (Bucket, Key) not in self.objects:
            raise ClientError(
                {"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}},
                "HeadObject",
            )
        return {}


def test_r2_adapter_uses_bucket_prefix_and_conditional_encrypted_write(monkeypatch):
    fake_s3 = FakeS3()
    monkeypatch.setenv("FISHEYE_R2_ACCESS_KEY_ID", "test-access")
    monkeypatch.setenv("FISHEYE_R2_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: fake_s3)
    store = S3ArtifactStore(
        endpoint_url="https://account.r2.cloudflarestorage.com",
        bucket="fisheye-artifacts",
        prefix="fisheye",
    )
    cipher = Fernet(Fernet.generate_key())

    write_encrypted_immutable(
        store,
        "datasets/ab/source.csv.enc",
        b"synthetic,csv",
        encrypt=cipher.encrypt,
        decrypt=cipher.decrypt,
    )
    # A retry encrypts with a new nonce, but must reuse the existing equivalent plaintext.
    write_encrypted_immutable(
        store,
        "datasets/ab/source.csv.enc",
        b"synthetic,csv",
        encrypt=cipher.encrypt,
        decrypt=cipher.decrypt,
    )

    assert store.read("datasets/ab/source.csv.enc") != b"synthetic,csv"
    assert cipher.decrypt(store.read("datasets/ab/source.csv.enc")) == b"synthetic,csv"
    assert list(fake_s3.objects) == [("fisheye-artifacts", "fisheye/datasets/ab/source.csv.enc")]


def test_r2_adapter_rejects_conflicting_immutable_content(monkeypatch):
    fake_s3 = FakeS3()
    monkeypatch.setenv("FISHEYE_R2_ACCESS_KEY_ID", "test-access")
    monkeypatch.setenv("FISHEYE_R2_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: fake_s3)
    store = S3ArtifactStore(
        endpoint_url="https://account.r2.cloudflarestorage.com",
        bucket="fisheye-artifacts",
        prefix="fisheye",
    )
    cipher = Fernet(Fernet.generate_key())
    write_encrypted_immutable(
        store, "runs/run-1/result.enc", b"first", encrypt=cipher.encrypt, decrypt=cipher.decrypt
    )

    with pytest.raises(RuntimeError, match="different content"):
        write_encrypted_immutable(
            store,
            "runs/run-1/result.enc",
            b"changed",
            encrypt=cipher.encrypt,
            decrypt=cipher.decrypt,
        )
