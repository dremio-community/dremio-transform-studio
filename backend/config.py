import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # ── Dremio connection (env var defaults; overridable via UI → stored in DB) ─
    dremio_host: str = os.getenv("DREMIO_HOST", "localhost")
    dremio_port: int = int(os.getenv("DREMIO_PORT", "9047"))
    dremio_ssl: bool = os.getenv("DREMIO_SSL", "false").lower() == "true"

    # Auth type: "password" (user/pass) or "pat" (Personal Access Token)
    dremio_auth_type: str = os.getenv("DREMIO_AUTH_TYPE", "password")

    # password auth
    dremio_user: str = os.getenv("DREMIO_USER", "mark")
    dremio_pass: str = os.getenv("DREMIO_PASS", "critter77")

    # PAT auth (Dremio Cloud or self-hosted with PAT enabled)
    dremio_pat: str = os.getenv("DREMIO_PAT", "")

    # Dremio Cloud project ID (required for Cloud, blank for self-hosted)
    dremio_project_id: str = os.getenv("DREMIO_PROJECT_ID", "")

    db_path: str = os.getenv("DB_PATH", "./transforms.db")

    # CORS — space-separated list of allowed origins, or "*" for open (default)
    # Example: "https://transforms.mycompany.com https://admin.mycompany.com"
    allowed_origins_raw: str = os.getenv("ALLOWED_ORIGINS", "*")

    @property
    def allowed_origins(self) -> list:
        raw = self.allowed_origins_raw.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split() if o.strip()]

    @property
    def dremio_base_url(self) -> str:
        scheme = "https" if self.dremio_ssl else "http"
        # For Dremio Cloud (api.dremio.cloud / api.eu.dremio.cloud) don't append port
        cloud_hosts = ("api.dremio.cloud", "api.eu.dremio.cloud")
        if self.dremio_host in cloud_hosts or self.dremio_ssl:
            return f"{scheme}://{self.dremio_host}"
        return f"{scheme}://{self.dremio_host}:{self.dremio_port}"

    def update(self, **kwargs) -> None:
        """Apply a dict of overrides at runtime (from UI settings)."""
        bool_keys = {"dremio_ssl"}
        int_keys = {"dremio_port"}
        for k, v in kwargs.items():
            if not hasattr(self, k) or v is None:
                continue
            if k in bool_keys:
                v = v if isinstance(v, bool) else str(v).lower() in ("true", "1", "yes")
            elif k in int_keys:
                v = int(v)
            object.__setattr__(self, k, v)

    @property
    def api_prefix(self) -> str:
        """Returns the API path prefix. Cloud uses /v0/projects/{id}, self-hosted uses empty."""
        if self.dremio_project_id:
            return f"/v0/projects/{self.dremio_project_id}"
        return ""

    def as_dict(self, redact: bool = True) -> dict:
        return {
            "host": self.dremio_host,
            "port": self.dremio_port,
            "ssl": self.dremio_ssl,
            "auth_type": self.dremio_auth_type,
            "user": self.dremio_user,
            "password": "***" if redact and self.dremio_pass else self.dremio_pass,
            "pat": "***" if redact and self.dremio_pat else self.dremio_pat,
            "project_id": self.dremio_project_id,
        }


settings = Settings()
