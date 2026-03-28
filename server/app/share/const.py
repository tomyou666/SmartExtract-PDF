"""ログ等で共有する定数（tomyou-ea の const から必要最小限のみ）。"""

from pathlib import Path

_SERVER_ROOT = Path(__file__).resolve().parent.parent.parent

IS_DEBUG = "IS_DEBUG"

LOG_DIR = str(_SERVER_ROOT / "log")
LOG_FILE = "pdf-llm-chat-server.log"
LOG_PATH = str(Path(LOG_DIR) / LOG_FILE)
LOG_MAX_BYTE = 1_000_000
