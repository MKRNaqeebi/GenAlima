"""
This script is used to create initial data in the database.
"""
import sys
import os
import logging

from sqlmodel import Session

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
# pylint: disable=wrong-import-position
from app.core.db import engine, init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init() -> None:
  """
  Initialize the service. This function will attempt to create a session with the database engine.
  """
  with Session(engine) as session:
    init_db(session)


def main() -> None:
  """
  Main function for the FastAPI application.
  """
  logger.info("Creating initial data")
  init()
  logger.info("Initial data created")


if __name__ == "__main__":
  main()
