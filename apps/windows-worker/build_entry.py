"""PyInstaller entry point that imports the worker as a package."""

from ai_operations_worker.client import main


if __name__ == "__main__":
    main()
