import json
import logging
import os
from pathlib import Path
import tempfile

logger = logging.getLogger(__name__)

class JsonStore:
    def __init__(self, filepath: str):
        self._filepath = filepath
        logger.debug(f"Opening file {filepath}")

    def read(self) -> dict:
        try:
            with open(self._filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            logger.info(f"File {self._filepath} not found.")
            return {}
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in {self._filepath}: {e.msg} at line {e.lineno}, column {e.colno}") from e

    def write(self, data: dict) -> None:
        destination = Path(self._filepath)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                             dir=destination.parent, prefix=destination.name + '.',
                                             suffix='.tmp', delete=False) as f:
                temporary = Path(f.name)
                json.dump(data, f, indent=4, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temporary, destination)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)