#!/bin/bash
# 安全部署到 CloudBase 静态托管（体验版）
#
# 关键约束（来自 2026-07-30 事故复盘）：
#   1. 绝对不能上传 .git —— .git/config 的 remote.origin.url 含明文 GitHub 令牌（ghp_…）。
#   2. CHANGELOG.md 是运行时资源（应用内「更新日志」页直接 fetch 它），必须上传，
#      之前因 blanket 排除 *.md 导致 1.3.72~1.3.76 更新日志在线上缺失，已修。
#   3. 内部文档（README / RULES / DB_SCHEMA / BATCH95_RESTORED / CloudBase后端化分析
#      / EXEC_PLAN*.md 计划文档）与 plans/、cloudbase/ 后端脚本、tests/、*.sh 均非运行时所需，排除。
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

# ============ 规则闸：先到 git，再到云端（保证 git 必有最新版本）============
# 目的：杜绝「云端领先 git」事故（曾出现云端 1.3.81、git 仅 1.3.79 的错位）。
# 强制：① 工作区必须干净（无未提交 / 未跟踪改动）→ 逼你先 commit；
#       ② 本地 main 必须已推送到 origin（origin/main == HEAD）→ 逼你先 push；
#       ③ 部署后回校 云端 version.json == 本地 version.json。
# 紧急绕过（不推荐）：SKIP_GIT_CHECK=1 ./deploy-cloudbase.sh
echo "▶ 规则闸：校验 git 为最新（先 git，再云端）…"
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ 工作区存在未提交改动，拒绝部署。请先 commit（规则：先到 git，再到云端）。"
  git status --short
  exit 1
fi
if [ "${SKIP_GIT_CHECK:-}" != "1" ]; then
  git fetch origin --quiet || { echo "❌ git fetch origin 失败，无法确认是否已推送，拒绝部署（或 SKIP_GIT_CHECK=1 紧急绕过）。"; exit 1; }
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "")
  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "❌ 本地 main 尚未推送到 origin（origin/main != HEAD），拒绝部署。请先 git push origin main（规则：先到 git，再到云端）。"
    echo "   本地 HEAD : $LOCAL"
    echo "   远端 main : $REMOTE"
    exit 1
  fi
  echo "   ✅ 工作区干净且已推送到 origin（HEAD = $LOCAL）"
else
  echo "   ⚠️  已通过 SKIP_GIT_CHECK 绕过 git 校验（不推荐）"
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
  --exclude='EXEC_PLAN*.md' \
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

# ============ 部署后校验：云端版本必须等于本地版本 ============
BASE_URL="https://${ENV_ID}-1301944898.tcloudbaseapp.com"
LOCAL_VER=$(grep -oP '"version": "\K[^"]+' version.json || true)
CLOUD_VER=$(curl -s --max-time 20 "$BASE_URL/version.json?_t=$(date +%s)" | grep -oP '"version": "\K[^"]+' || true)
if [ "$LOCAL_VER" != "$CLOUD_VER" ]; then
  echo "❌ 部署后校验失败：云端版本 $CLOUD_VER 不等于本地版本 $LOCAL_VER"
  exit 1
fi
echo "✅ 部署后校验通过：云端版本 = 本地版本 = $LOCAL_VER"
echo "✅ 部署完成。访问: $BASE_URL"
