"""
This module is used to initialize the FastAPI application.
It will attempt to create a session with the database engine.
"""
import sys
import os
import logging

from sqlalchemy import Engine
from sqlmodel import Session, select
from tenacity import after_log, before_log, retry, stop_after_attempt, wait_fixed

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# pylint: disable=wrong-import-position
from app.core.db import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_TRIES = 60 * 5  # 5 minutes
WAIT_SECONDS = 1


@retry(
  stop=stop_after_attempt(MAX_TRIES),
  wait=wait_fixed(WAIT_SECONDS),
  before=before_log(logger, logging.INFO),
  after=after_log(logger, logging.WARN),
)
def init(db_engine: Engine) -> None:
  """
  Initialize the service. This function will attempt to create a session with the database engine.
  """
  try:
    with Session(db_engine) as session:
      # Try to create session to check if DB is awake
      session.exec(select(1))
  except Exception as e:
    logger.error(e)
    raise e

def main() -> None:
  """
  Main function for the FastAPI application.
  """
  logger.info("Initializing service")
  init(engine)
  logger.info("Service finished initializing")

if __name__ == "__main__":
  main()
