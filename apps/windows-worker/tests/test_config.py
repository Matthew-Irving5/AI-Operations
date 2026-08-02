import pytest

from ai_operations_worker.config import WorkerEndpoint


def test_worker_requires_an_outbound_https_control_plane() -> None:
    with pytest.raises(ValueError, match="control_plane_must_use_https"):
        WorkerEndpoint("http://localhost:8080").validate()
