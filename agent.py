"""
agent.py - Main Entrypoint for Gemini Live Conversational Agent.
Runs the modern Web UI by default, or the CLI terminal agent when --cli is specified.
"""

import sys
import argparse


def main():
    parser = argparse.ArgumentParser(
        description="Gemini Live Conversational Agent (Web UI & CLI Backup)"
    )
    parser.add_argument(
        "--cli", "-c",
        action="store_true",
        help="Run the terminal PyAudio agent instead of the Web UI"
    )
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=8080,
        help="Port to run the Web UI server on (default: 8080)"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host address for the Web UI server (default: 0.0.0.0)"
    )

    args, unknown = parser.parse_known_args()

    if args.cli:
        print("\n🚀 Launching Terminal CLI Agent (Backup Mode)...")
        from cli_agent import main as cli_main
        cli_main()
    else:
        import os
        os.environ["PORT"] = str(args.port)
        os.environ["HOST"] = args.host
        from server import main as server_main
        server_main()


if __name__ == "__main__":
    main()
