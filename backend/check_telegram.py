"""Upload a disposable sample and verify the bytes returned by the local Bot API."""

import argparse
import getpass
import hashlib
import http.client
import json
import re
from pathlib import Path


def request(token, method, **fields):
    connection = http.client.HTTPConnection("127.0.0.1", 8081, timeout=600)
    try:
        connection.request(
            "POST", f"/bot{token}/{method}", json.dumps(fields),
            {"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        payload = json.load(response)
    finally:
        connection.close()
    if not payload.get("ok"):
        raise RuntimeError(f"{method} failed (HTTP {response.status}).")
    return payload["result"]


def digest(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def check(token, channel, sample):
    chat = request(token, "getChat", chat_id=channel)
    if chat["type"] != "channel" or chat.get("username") or chat.get("active_usernames"):
        raise RuntimeError("Use a private Telegram channel.")
    expected = digest(sample)
    message = request(token, "sendDocument", chat_id=channel, document=sample.as_uri())
    print(f"Uploaded test post {message['message_id']}. Delete it in Telegram after testing.", flush=True)
    result = request(token, "getFile", file_id=message["document"]["file_id"])
    returned = Path(result["file_path"])
    if not returned.is_absolute() or not returned.is_file():
        raise RuntimeError("getFile did not return a readable local file. Check --local and run on the VM.")
    if digest(returned) != expected:
        raise RuntimeError("The returned file differs from the sample.")
    print(f"Verified {returned.stat().st_size:,} bytes (SHA-256 match).")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("channel", help="Numeric ID of the private test channel (starts with -100)")
    parser.add_argument("sample", type=Path, help="Path to a disposable test file on the VM")
    args = parser.parse_args()
    if not re.fullmatch(r"-100[0-9]+", args.channel):
        parser.error("use the numeric private channel ID")
    sample = args.sample.resolve()
    if not sample.is_file() or not 0 < sample.stat().st_size <= 2_000_000_000:
        parser.error("choose a nonempty sample no larger than one 2,000 MB Telegram document; use verify_live.py for split files")
    token = getpass.getpass("Telegram bot token: ").strip()
    if not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]+", token):
        parser.error("invalid bot token format")
    try:
        check(token, args.channel, sample)
    except RuntimeError as error:
        parser.exit(1, f"{error}\n")
    except (OSError, ValueError, KeyError, http.client.HTTPException):
        parser.exit(1, "Could not complete the test. Check the local Bot API and file permissions.\n")


if __name__ == "__main__":
    main()
