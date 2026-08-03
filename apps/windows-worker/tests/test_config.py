import pytest

from ai_operations_worker.config import WorkerEndpoint
from ai_operations_worker.client import WorkerConfiguration
from pathlib import Path


def test_worker_requires_an_outbound_https_control_plane() -> None:
    with pytest.raises(ValueError, match="control_plane_must_use_https"):
        WorkerEndpoint("http://localhost:8080").validate()

def test_worker_configuration_has_no_listener_or_inbound_port() -> None:
    configuration = WorkerConfiguration(WorkerEndpoint("https://control.example.test"), "secret", "device", Path("state.sqlite"), Path("key.dpapi"), "public", (Path("C:/safe"),), Path("C:/safe/quarantine"))
    assert configuration.poll_seconds == 300
