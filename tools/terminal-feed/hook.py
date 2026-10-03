#!/usr/bin/env python3
"""UserPromptSubmit hook: prints the other-terminals feed so Claude sees it with your message.
Claude Code passes the hook a JSON object on stdin that carries session_id."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import terminal_feed
try:
    sid = json.load(sys.stdin).get("session_id")
except Exception:
    sid = os.environ.get("CLAUDE_CODE_SESSION_ID")
try:
    out = terminal_feed.render(sid)
    if out:
        print("<other-terminals>\n" + out + "\n</other-terminals>")
except Exception:
    pass  # a hook must never block a prompt
