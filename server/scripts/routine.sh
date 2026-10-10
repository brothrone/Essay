#!/bin/bash
# 정기 작업 (월 · 목 10시, ~/Library/LaunchAgents/win.essay.collect.plist): Gemini CLI(agy)가
# 1) 주요 기업 8곳의 공고 · 문항 · 분석을 모아 확인 대기로 올리고(collect.mjs) 2) 원문과 하나씩 대조해 공개 · 숨김을 정한다(verify.mjs).
# Claude 는 이 작업을 하지 않는다 (사용자 지시 2026-10-11). 기록은 server/.collect/routine-*.log
set -u
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p .collect
LOG=".collect/routine-$(date +%Y%m%d-%H%M).log"
{
  echo "== 모으기 (Gemini CLI) $(date)"
  node scripts/collect.mjs --rotate 8 --ai agy
  echo
  echo "== 원문 대조 · 공개 (Gemini CLI) $(date)"
  node scripts/verify.mjs
  echo "== 끝 $(date)"
} >> "$LOG" 2>&1
