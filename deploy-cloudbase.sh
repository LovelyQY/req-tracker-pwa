#!/bin/bash
# 安全部署到 CloudBase 静态托管（体验版）
#
# 关键约束（来自 2026-07-30 事故复盘）：
#   1. 绝对不能上传 .git —— .git/config 的 remote.origin.url 含明文 GitHub 令牌（ghp_…）。
#   2. CHANGELOG.md 是运行时资源（应用内「更新日志」页直接 fetch 它），必须上传，
#      之前因 blanket 排除 *.md 导致 1.3.72~1.3.76 更新日志在线上缺失，已修。
#   3. 内部文档（README / RULES / DB_SCHEMA / BATCH95_RESTORED / CloudBase后端化分析）
#      与 plans/、cloudbase/ 后端脚本、tests/、*.sh 均非运行时所需，排除。
#
# 用法: ./deploy-cloudbase.sh [envId]
#   envId 默认 pwa-20260724-d2g883p981e75c948
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ENV_ID="${1:-pwa-20260724-d2g883p981e75c948}"

# tcb CLI 路径（环境固定）；PATH 上若另有 tcb 则优先用 PATH 的
TCB="$(command -v tcb || true)"
if [ -z "$TCB" ]; then
  TCB="/root/.nvm/versions/node/v22.13.1/bin/tcb"
fi
if [ ! -x "$TCB" ]; then
  echo "❌ 找不到 tcb CLI：$TCB"
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "▶ 构建安全副本（排除 .git / 内部目录 / 内部文档 / *.sh）…"
tar \
  --exclude='.git' \
  --exclude='.githooks' \
  --exclude='node_modules' \
  --exclude='cloudbase' \
  --exclude='tests' \
  --exclude='plans' \
  --exclude='*.sh' \
  --exclude='package.json' \
  --exclude='package-lock.json' \
  --exclude='README.md' \
  --exclude='RULES.md' \
  --exclude='DB_SCHEMA.md' \
  --exclude='BATCH95_RESTORED.md' \
  --exclude='CloudBase后端化分析与执行方案.md' \
  -cf - . | tar -xf - -C "$TMP"

echo "   副本文件数: $(find "$TMP" -type f | wc -l)"
if [ -f "$TMP/CHANGELOG.md" ]; then
  echo "   CHANGELOG.md 最新条目: $(grep -m1 '## v' "$TMP/CHANGELOG.md")"
else
  echo "❌ CHANGELOG.md 未进入副本，部署将缺失更新日志，已中止"
  exit 1
fi
if [ -d "$TMP/.git" ]; then
  echo "❌ .git 被错误包含，已中止（令牌泄漏风险）"
  exit 1
fi

echo "▶ 上传到 CloudBase 静态托管 (env: $ENV_ID)…"
"$TCB" hosting deploy "$TMP" -e "$ENV_ID"

echo "✅ 部署完成。访问: https://${ENV_ID}-1301944898.tcloudbaseapp.com"
