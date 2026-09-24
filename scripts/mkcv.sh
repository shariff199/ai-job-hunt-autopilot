#!/bin/bash
# usage: mkcv.sh <linkedin id> "<Company>" "<Title>" <Short>  -> prints "<PDF path> pages <n>" (lean tailored, one page)
# The candidate name in the file name comes from candidate.full_name in config/profile.yml.
set -o pipefail
cd "$(dirname "$0")/.." || exit 1
S=$(mktemp -d "${TMPDIR:-/tmp}/mkcv.XXXXXX")
trap 'rm -rf "$S"' EXIT
NAME=$(node -e "
const y=require('js-yaml').load(require('fs').readFileSync('config/profile.yml','utf8'))||{};
const n=(y.candidate&&y.candidate.full_name)||'';
process.stdout.write(n.replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,''));") || { echo "could not read config/profile.yml" >&2; exit 1; }
[ -n "$NAME" ] || { echo "config/profile.yml has no candidate.full_name" >&2; exit 1; }
curl -s -A "Mozilla/5.0 Chrome/126" "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/$1" | python3 -c "
import sys,re,html
t=sys.stdin.read(); m=re.search(r'show-more-less-html__markup[^>]*>(.*?)</div>',t,re.S)
print(re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',m.group(1) if m else ''))))" > "$S/jd-$1.txt"
out=$(node tailor-v2.mjs --jd-file "$S/jd-$1.txt" --company "$2" --title "$3" --lean 2>&1 | grep written | awk '{print $2}')
[ -n "$out" ] || { echo "tailor-v2 wrote nothing (advert text too short or closed?)" >&2; exit 1; }
PDF="$PWD/$out/CV-$NAME-$4.pdf"
node generate-cv.mjs --md "$out/cv.md" --output "$PDF" >/dev/null || exit 1
python3 -c "
import re,sys;d=open(sys.argv[1],'rb').read();n=len(re.findall(rb'/Type\s*/Page[^s]',d));print(sys.argv[1], 'pages',n)" "$PDF"
