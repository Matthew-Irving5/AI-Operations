from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class WorkerEndpoint:
    """HTTPS-only control-plane endpoint; no listener is ever configured locally."""

    control_plane_url: str

    def validate(self) -> None:
        parsed = urlparse(self.control_plane_url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("control_plane_must_use_https")
