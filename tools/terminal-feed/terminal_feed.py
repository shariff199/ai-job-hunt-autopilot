#!/usr/bin/env python3
"""terminal_feed.py — what your OTHER Claude Code terminals did since this one last heard from you.

WHY THIS EXISTS
    If you run several Claude Code terminals at once, each one only knows what
    it was told. You tell one terminal "the interview went well" and another
    asks you the same thing an hour later. This hook fixes that: on every
    message you type, it reports what you typed in your OTHER terminals and
    which files they changed since this terminal last heard from you.

    Deterministic: it reads the transcripts Claude Code already writes
    (~/.claude/projects/*/*.jsonl) and does not depend on any session
    remembering to report.

    State per session (the time of its previous message) lives in
    ~/.claude/terminal-feed/<session>.json. Output is capped so it never crowds a prompt.
"""
import datetime
import json
import os
import re

PROJECTS = os.path.expanduser("~/.claude/projects")
STATE_DIR = os.path.expanduser("~/.claude/terminal-feed")
SESSIONS = os.path.expanduser("~/.claude/terminal-feed/sessions.json")  # optional: {"sessions": {id: {"project_id": "label"}}}
FIRST_LOOKBACK_MIN = 60     # a session's first message looks back this far
TAIL_BYTES = 600_000        # enough for an hour of a busy transcript
CAP = 900
NOT_HIS = ("<", "Another Claude session sent a message", "[SYSTEM NOTIFICATION",
           "[Request interrupted", "Base directory for this skill",
           "This session is being continued", "Caveat:")
HOME = os.path.expanduser("~")


def _parse_ts(s):
    try:
        return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _since(sid, now):
    path = os.path.join(STATE_DIR, "%s.json" % sid)
    try:
        with open(path) as fh:
            prev = _parse_ts(json.load(fh).get("last_prompt_at"))
    except (OSError, ValueError):
        prev = None
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(path, "w") as fh:
        json.dump({"last_prompt_at": now.isoformat()}, fh)
    return prev or (now - datetime.timedelta(minutes=FIRST_LOOKBACK_MIN))


def _projects():
    try:
        with open(SESSIONS) as fh:
            return {k: (v.get("project_id") or "").replace("proj_", "")
                    for k, v in json.load(fh).get("sessions", {}).items()}
    except (OSError, ValueError):
        return {}


def _short_path(p):
    p = p.replace(HOME + "/", "~/")
    parts = p.split("/")
    return "/".join(parts[-2:]) if len(parts) > 3 else p


def _scan(path, since):
    size = os.path.getsize(path)
    with open(path, "rb") as fh:
        if size > TAIL_BYTES:
            fh.seek(size - TAIL_BYTES)
            fh.readline()
        raw = fh.read().decode("utf-8", "replace")
    asks, files, commits = [], [], 0
    for line in raw.splitlines():
        try:
            r = json.loads(line)
        except ValueError:
            continue
        ts = _parse_ts(r.get("timestamp"))
        if not ts or ts <= since:
            continue
        msg = r.get("message") or {}
        if r.get("type") == "user" and not r.get("isMeta"):
            c = msg.get("content")
            text = c if isinstance(c, str) else " ".join(
                b.get("text", "") for b in (c or []) if isinstance(b, dict) and b.get("type") == "text")
            text = (text or "").strip()
            if len(text) > 8 and not text.startswith(NOT_HIS):
                asks.append(re.sub(r"\s+", " ", text)[:150])
        elif r.get("type") == "assistant":
            for b in msg.get("content") or []:
                if not isinstance(b, dict) or b.get("type") != "tool_use":
                    continue
                inp = b.get("input") or {}
                if b.get("name") in ("Write", "Edit", "NotebookEdit") and inp.get("file_path"):
                    files.append(_short_path(inp["file_path"]))
                elif b.get("name") == "Bash" and re.search(r"\bgit\b[^|;&]*\bcommit\b", inp.get("command") or ""):
                    commits += 1
    return asks, list(dict.fromkeys(files)), commits


def render(session_id, now=None):
    if not session_id:
        return ""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    since = _since(session_id, now)
    cutoff = since.timestamp()
    projects = _projects()
    blocks = []
    try:
        dirs = [os.path.join(PROJECTS, d) for d in os.listdir(PROJECTS)]
    except OSError:
        return ""
    for d in dirs:
        try:
            entries = [e for e in os.scandir(d) if e.name.endswith(".jsonl") and e.is_file()]
        except OSError:
            continue
        for e in entries:
            sid = e.name[:-6]
            if sid == session_id or e.stat().st_mtime <= cutoff:
                continue
            asks, files, commits = _scan(e.path, since)
            if not asks and not files and not commits:
                continue
            label = projects.get(sid) or os.path.basename(d).replace(HOME.replace("/", "-"), "~").replace("-", "/") or "?"
            head = "  · %s (%s)" % (sid[:8], label)
            bits = []
            if asks:
                bits.append("you said: " + " | ".join('"%s"' % a[:110] for a in asks[-2:]))
            if files:
                bits.append("changed %s%s" % (", ".join(files[:4]), " +%d more" % (len(files) - 4) if len(files) > 4 else ""))
            if commits:
                bits.append("%d commit(s)" % commits)
            blocks.append(head + ": " + "; ".join(bits))
    if not blocks:
        return ""
    out = ("OTHER TERMINALS since your last message (read this before asking "
           "anything they already told you):\n" + "\n".join(blocks))
    return out if len(out) <= CAP else out[:CAP].rsplit("\n", 1)[0] + "\n  …"


if __name__ == "__main__":
    import sys
    sid = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("CLAUDE_CODE_SESSION_ID")
    print(render(sid))
