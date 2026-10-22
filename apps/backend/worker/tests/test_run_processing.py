import hashlib
import json
from types import SimpleNamespace

import fisheye_worker.run_processing as run_processing
import polars as pl
from cryptography.fernet import Fernet
from fisheye_persistence.runs import RunLease
from fisheye_worker.run_processing import _publish_result_artifact, _worker_build_revision


def test_retry_reuses_the_published_manifest(tmp_path, monkeypatch) -> None:
    key = Fernet.generate_key()
    lease = RunLease(
        run_id="run-test",
        dataset_id="dataset-test",
        context_artifact_uri="context.json.enc",
        context_sha256="a" * 64,
        methodology_version="fisheye.employee-day-experimental.v1",
        config_sha256="b" * 64,
        lease_token="lease-token",
        attempt_count=1,
    )
    dataset = SimpleNamespace(
        id="dataset-test",
        sha256="c" * 64,
        schema_version="fisheye.events.v2",
    )
    scores = pl.DataFrame({"employee_id": ["synthetic-1"], "score": [50]})
    metrics = {"evaluation_unit_count": 1}

    first = _publish_result_artifact(lease, dataset, "d" * 64, scores, metrics, tmp_path, key)
    monkeypatch.setattr(run_processing, "_worker_build_revision", lambda: "new-worker-build")
    retry = _publish_result_artifact(lease, dataset, "d" * 64, scores, metrics, tmp_path, key)

    assert retry == first
    manifest_path = tmp_path / first[0] / "manifest.json.enc"
    manifest = json.loads(Fernet(key).decrypt(manifest_path.read_bytes()))
    manifest_bytes = Fernet(key).decrypt(manifest_path.read_bytes())
    assert hashlib.sha256(manifest_bytes).hexdigest() == first[1]
    assert manifest["run_id"] == lease.run_id


def test_manifest_publish_race_reuses_valid_winner(tmp_path, monkeypatch) -> None:
    key = Fernet.generate_key()
    lease = RunLease(
        run_id="run-race",
        dataset_id="dataset-race",
        context_artifact_uri="context.json.enc",
        context_sha256="a" * 64,
        methodology_version="fisheye.employee-day-experimental.v1",
        config_sha256="b" * 64,
        lease_token="lease-token",
        attempt_count=1,
    )
    dataset = SimpleNamespace(
        id="dataset-race",
        sha256="c" * 64,
        schema_version="fisheye.events.v2",
    )
    scores = pl.DataFrame({"employee_id": ["synthetic-1"], "score": [50]})
    metrics = {"evaluation_unit_count": 1}
    original = run_processing.write_encrypted_immutable

    def publish_competing_manifest(store, relative_uri, plaintext, *, encrypt, decrypt):
        if relative_uri.endswith("/manifest.json.enc"):
            winner = json.loads(plaintext)
            winner["completed_at"] = "2026-01-01T00:00:00+00:00"
            winner["worker_build_revision"] = "concurrent-worker-build"
            winner_bytes = (json.dumps(winner, indent=2, sort_keys=True) + "\n").encode()
            store.write_immutable(relative_uri, encrypt(winner_bytes))
        return original(store, relative_uri, plaintext, encrypt=encrypt, decrypt=decrypt)

    monkeypatch.setattr(run_processing, "write_encrypted_immutable", publish_competing_manifest)
    result = _publish_result_artifact(lease, dataset, "d" * 64, scores, metrics, tmp_path, key)

    winner_bytes = Fernet(key).decrypt((tmp_path / result[0] / "manifest.json.enc").read_bytes())
    assert hashlib.sha256(winner_bytes).hexdigest() == result[1]
    assert json.loads(winner_bytes)["worker_build_revision"] == "concurrent-worker-build"


def test_worker_revision_fallback_fingerprints_source_tree(monkeypatch) -> None:
    monkeypatch.delenv("FISHEYE_CODE_REVISION", raising=False)
    revision = _worker_build_revision()

    assert revision.startswith("source-tree-sha256:")
    assert len(revision.removeprefix("source-tree-sha256:")) == 64


def test_worker_revision_uses_immutable_deployment_revision(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_CODE_REVISION", "build-abc123")

    assert _worker_build_revision() == "build-abc123"
