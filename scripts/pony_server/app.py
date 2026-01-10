import argparse
from http.server import ThreadingHTTPServer

from .config import DEFAULT_DATA, DEFAULT_ENV_FILE, DEFAULT_MAP_PATH, DEFAULT_OUTPUT_DIR, DEFAULT_STATE_PATH
from .handler import PonyHandler


def parse_args():
    parser = argparse.ArgumentParser(
        description="Serve the Pony Parade site and generate new pony images.",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--data", default=DEFAULT_DATA)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE)
    parser.add_argument("--map", default=DEFAULT_MAP_PATH)
    parser.add_argument("--state", default=DEFAULT_STATE_PATH)
    return parser.parse_args()


def main():
    args = parse_args()

    handler = lambda *handler_args, **handler_kwargs: PonyHandler(  # noqa: E731
        *handler_args,
        data_path=args.data,
        output_dir=args.output_dir,
        env_file=args.env_file,
        map_path=args.map,
        state_path=args.state,
        **handler_kwargs,
    )

    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        print(f"Serving Pony Parade at http://{args.host}:{args.port}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

    return 0
