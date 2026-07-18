#!/bin/bash
# req-tracker-pwa 一键发版脚本
# 用法: ./release.sh <版本号> [时间戳] [发布说明]
# 示例: ./release.sh 1.0.37 "2026-07-13 10:00" "中文说明"
#       ./release.sh 1.0.37                       # 时间戳自动 + 无说明
#       ./release.sh 1.0.37 "中文说明"            # 省略时间戳，说明取最后一个参数

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ---------- 更新日志本地产物 CHANGELOG.md ----------
# 规则固定：每次发版都由本脚本写入 CHANGELOG.md（# 标题下，每条 ## vX.Y.Z (日期) + 说明），
# 纳入版本控制并随 PWA 离线可用；前端直接读本地文件，彻底不再依赖 GitHub API。
# 这样从机制上保证：① 每个发版都有带版本号的更新日志条目；② 离线也不会「没有更新日志」。
# 从当前 CHANGELOG.md 提取某版本的明细（发版重生成时优先保留，避免把手动补全的说明冲掉）
get_existing_body() {
  local ver="$1"
  awk -v target="## v${ver} (" '
    /^## v/ {
      if (capturing) exit;
      if (index($0, target) == 1) { capturing = 1; next; }
      next;
    }
    capturing && NF { print }
  ' CHANGELOG.md
}

build_changelog_md() {
  local mode="${1:-release}"   # release=发版中(当前版本尚未提交，手动置顶) | seed=仅依据 git 历史
  local entries=""
  if [ "$mode" != "seed" ]; then
    entries+="## v$NEW_VER ($TIMESTAMP)"$'\n'"$DESC"$'\n'$'\n'
  fi
  # 历史发版：从 git 提交历史提取 chore(release): vX.Y.Z
  local raw
  raw=$(git log --grep='chore(release): v' --date=format-local:'%Y-%m-%d %H:%M' --pretty=format:'%cd%x1f%s%x1f%b%x1e' 2>/dev/null)
  local rec ci rest subj body ver
  while IFS= read -r -d $'\x1e' rec; do
    [ -z "$rec" ] && continue
    ci="${rec%%$'\x1f'*}"
    rest="${rec#*$'\x1f'}"
    subj="${rest%%$'\x1f'*}"
    body="${rest#*$'\x1f'}"
    # 去掉 git 在记录前/后产生的空白（含换行）。注意必须用 sed -z（整段当单行处理），
    # 否则 sed 会先按 \n 切行，前导换行变成行分隔符，s/^[[:space:]]*// 碰不到它。
    ci=$(printf '%s' "$ci" | sed -z -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    body=$(printf '%s' "$body" | sed -z -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    ver=$(printf '%s' "$subj" | grep -oP 'v\K[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    [ -z "$ver" ] && continue
    # 优先保留 CHANGELOG.md 中已有、且非占位的明细，避免发版时把手动补全的说明冲掉
    local existing
    existing=$(get_existing_body "$ver")
    if [ -n "$existing" ] && [ "$existing" != "更新版本" ]; then
      body="$existing"
    fi
    entries+="## v$ver ($ci)"$'\n'"$body"$'\n'$'\n'
  done <<< "$raw"
  { echo "# 更新日志"; echo ""; printf '%s' "$entries"; } > CHANGELOG.md
}

# 仅依据 git 历史重新生成 CHANGELOG.md（不升版本、不动版本文件）
# 注意：脚本启用了 set -u，无参数时 $1 未绑定会直接报错，故用 ${1:-} 兜底
if [ "${1:-}" = "--changelog" ]; then
  build_changelog_md "seed"
  echo "✅ 已根据 git 历史重新生成 CHANGELOG.md（未改动版本号）"
  exit 0
fi

# ---------- 参数处理（支持 --next 自动计算下一版本）----------
# 版本号规则：X.Y.Z，修订号 Z 到 99 时进位 minor（Y+1、Z 归零），即 1.0.99 -> 1.1.0
# 用法:
#   $0               自动计算下一版本（修订号 <99 时 Z+1；==99 时 Y+1、Z=0）
#   $0 --next        同上
#   $0 X.Y.Z         手动指定版本号
# 示例:
#   $0            # 当前 1.0.98 -> 1.0.99；当前 1.0.99 -> 1.1.0
#   $0 1.1.0 "说明"  # 手动指定（如刻意跳过 1.0.99 直接升 1.1.0）
if [ $# -eq 0 ] || [ "${1:-}" = "--next" ] || [ "${1:-}" = "-n" ]; then
  CUR=$(grep -oP "APP_VERSION = '\K[0-9]+\.[0-9]+\.[0-9]+" index.html | head -1)
  if [ -z "$CUR" ]; then
    echo "❌ 无法从 index.html 读取当前 APP_VERSION，请手动指定版本号，如: $0 1.1.0"
    exit 1
  fi
  IFS='.' read -r _MAJ _MIN _PAT <<< "$CUR"
  if [ "$_PAT" -ge 99 ]; then
    _MIN=$((_MIN + 1)); _PAT=0
  else
    _PAT=$((_PAT + 1))
  fi
  NEW_VER="${_MAJ}.${_MIN}.${_PAT}"
  echo "🔢 当前版本 v$CUR，按「修订号到 99 进位 minor」规则自动计算下一版本: v$NEW_VER"
  # 把算出的版本号放到 $1，原有说明参数（如有）顺延
  set -- "$NEW_VER" "${@:2}"
fi

NEW_VER="$1"
if ! [[ "$NEW_VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ 版本号格式错误，要求 X.Y.Z（如 1.0.37），收到: $NEW_VER"
  exit 1
fi

# 参数约定: $1=版本号  $2=时间戳(可选)  $3或最后一个参数=发布说明(DESC)
# 若省略时间戳直接给说明，则 $2 即为说明（DESC 取最后一个参数）
if [ -n "${3:-}" ]; then
  DESC="${3:-}"
  TIMESTAMP="${2:-}"
elif [ -n "${2:-}" ] && [[ "${2:-}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]][0-9]{2}:[0-9]{2}$ ]]; then
  DESC=""
  TIMESTAMP="$2"
else
  DESC="${2:-}"
  TIMESTAMP=""
fi
if [ -z "$TIMESTAMP" ]; then
  TIMESTAMP="$(date '+%Y-%m-%d %H:%M')"
fi

echo ""
echo "═══════════════════════════════════════"
echo "  req-tracker-pwa 发版工具"
echo "═══════════════════════════════════════"
echo "  新版本: v$NEW_VER"
echo "  时间戳: $TIMESTAMP"
echo "═══════════════════════════════════════"
echo ""

# ---------- 替换前检查 ----------
check_file() {
  if [ ! -f "$1" ]; then
    echo "❌ 文件不存在: $1"
    exit 1
  fi
}

check_file "index.html"
check_file "sw.js"

OLD_VER_COUNT=$(grep -c "SW_VERSION = '[0-9]\+\.[0-9]\+\.[0-9]\+'" index.html || true)
if [ "$OLD_VER_COUNT" -ne 1 ]; then
  echo "❌ 错误: index.html 中 SW_VERSION 出现 $OLD_VER_COUNT 次（预期 1 次），请检查后重试"
  exit 1
fi

APP_VER_COUNT=$(grep -c "APP_VERSION = '[0-9]\+\.[0-9]\+\.[0-9]\+'" index.html || true)
if [ "$APP_VER_COUNT" -ne 1 ]; then
  echo "❌ 错误: index.html 中 APP_VERSION 出现 $APP_VER_COUNT 次（预期 1 次），请检查后重试"
  exit 1
fi

CACHE_COUNT=$(grep -c "CACHE = 'req-tracker-v[0-9]\+\.[0-9]\+\.[0-9]\+'" sw.js || true)
if [ "$CACHE_COUNT" -ne 1 ]; then
  echo "❌ 错误: sw.js 中 CACHE 出现 $CACHE_COUNT 次（预期 1 次），请检查后重试"
  exit 1
fi

RELEASE_TIME_COUNT=$(grep -c "APP_RELEASE_TIME = '" index.html || true)
if [ "$RELEASE_TIME_COUNT" -ne 1 ]; then
  echo "❌ 错误: index.html 中 APP_RELEASE_TIME 出现 $RELEASE_TIME_COUNT 次（预期 1 次），请检查后重试"
  # 如果有 req-tracker.html 可能是 2，但我们已删除它，所以应该是 1
  exit 1
fi

echo "✅ 文件检查通过，开始替换..."
echo ""

# ---------- 执行替换 ----------
# 替换并即时校验：命中打印 ✅，未命中打印 ❌（最终一致性校验会兜底 exit 1）
patch_ver() {  # $1=文件 $2=sed表达式 $3=校验grep表达式 $4=名称
  sed -i "$2" "$1"
  if grep -q "$3" "$1"; then
    echo "  ✅ $4"
  else
    echo "  ❌ $4 替换后未找到预期内容"
  fi
}

# 1. index.html: SW_VERSION
patch_ver index.html "s/SW_VERSION = '[0-9]*\.[0-9]*\.[0-9]*'/SW_VERSION = '$NEW_VER'/g" "SW_VERSION = '$NEW_VER'" "SW_VERSION → $NEW_VER (index.html)"

# 2. index.html: APP_VERSION
patch_ver index.html "s/APP_VERSION = '[0-9]*\.[0-9]*\.[0-9]*'/APP_VERSION = '$NEW_VER'/g" "APP_VERSION = '$NEW_VER'" "APP_VERSION → $NEW_VER (index.html)"

# 3. sw.js: CACHE 名称
patch_ver sw.js "s/CACHE = 'req-tracker-v[0-9]*\.[0-9]*\.[0-9]*'/CACHE = 'req-tracker-v$NEW_VER'/g" "CACHE = 'req-tracker-v$NEW_VER'" "CACHE → req-tracker-v$NEW_VER (sw.js)"

# 3.5 index.html: 资源版本化 URL（app.js / styles.css 缓存破坏，避免刷新仍是旧版）
#     版本化 URL 中的 ? 一律用字符类 [?]（sed 与 grep -P 均无歧义；本环境 sed 的 \? 会被当成可选量词）
patch_ver index.html "s/app\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/app.js?v=$NEW_VER/g" "app.js?v=$NEW_VER" "app.js?v= → $NEW_VER (index.html)"
patch_ver index.html "s/styles\.css[?]v=[0-9]*\.[0-9]*\.[0-9]*/styles.css?v=$NEW_VER/g" "styles.css?v=$NEW_VER" "styles.css?v= → $NEW_VER (index.html)"

# 3.7 company.html: companies.js 版本化 URL（公司数据模块，缓存破坏随发版升级）
COMPANY_PAGES="company.html"
for f in $COMPANY_PAGES; do
  if [ -f "$f" ]; then
    patch_ver "$f" "s/companies\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/companies.js?v=$NEW_VER/g" "companies.js?v=$NEW_VER" "companies.js?v= → $NEW_VER ($f)"
  fi
done

# 3.6 各页面: auth.js 版本化 URL（共享会话模块，缓存破坏随发版升级）
AUTH_PAGES="index.html status.html profile.html profile-edit.html login/classic.html"
for f in $AUTH_PAGES; do
  if [ -f "$f" ]; then
    patch_ver "$f" "s/auth\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/auth.js?v=$NEW_VER/g" "auth.js?v=$NEW_VER" "auth.js?v= → $NEW_VER ($f)"
  fi
done

# 4. index.html: APP_RELEASE_TIME（离线回退值）
sed -i "s/APP_RELEASE_TIME = '[^']*'/APP_RELEASE_TIME = '$TIMESTAMP'/g" index.html
if grep -q "APP_RELEASE_TIME = '$TIMESTAMP'" index.html; then
  echo "  ✅ APP_RELEASE_TIME → $TIMESTAMP (index.html)"
else
  echo "  ❌ APP_RELEASE_TIME 替换后未找到预期内容"
fi

# 4.5 version.json：同源版本清单，供前端自动检测新版本
cat > version.json <<JSON
{
  "version": "$NEW_VER",
  "time": "$TIMESTAMP"
}
JSON
echo "  ✅ version.json → $NEW_VER (时间戳 $TIMESTAMP)"

# 4.6 CHANGELOG.md：随发版生成的本地更新日志（离线可用，前端直接读取，不再依赖 GitHub API）
build_changelog_md "release"
echo "  ✅ CHANGELOG.md → v$NEW_VER"

echo ""

# ---------- 验证结果 ----------
echo "═══════════════════════════════════════"
echo "  验证结果"
echo "═══════════════════════════════════════"

echo ""
echo "--- 版本号位置 ---"
grep -n "SW_VERSION\|APP_VERSION" index.html | grep -E "= '.*'" || true
grep -n "CACHE = " sw.js | grep -v "//" || true

echo ""
echo "--- 时间戳位置 ---"
grep -n "APP_RELEASE_TIME" index.html | grep "=" || true

echo ""

# 最终一致性校验（覆盖全部 7 处版本/时间戳引用，任一不符即中断）
FINAL_SW=$(grep -oP "SW_VERSION = '\K[^']+" index.html || echo "")
FINAL_APP=$(grep -oP "APP_VERSION = '\K[^']+" index.html || echo "")
FINAL_CACHE=$(grep -oP "CACHE = 'req-tracker-v\K[^']+" sw.js || echo "")
FINAL_APPJS=$(grep -oP "app\.js[?]v=\K[0-9.]+" index.html || echo "")
FINAL_CSS=$(grep -oP "styles\.css[?]v=\K[0-9.]+" index.html || echo "")
FINAL_AUTHJS_INDEX=$(grep -oP "auth\.js[?]v=\K[0-9.]+" index.html || echo "")
FINAL_AUTHJS_STATUS=$(grep -oP "auth\.js[?]v=\K[0-9.]+" status.html || echo "")
FINAL_AUTHJS_PROFILE=$(grep -oP "auth\.js[?]v=\K[0-9.]+" profile.html || echo "")
FINAL_AUTHJS_PEDIT=$(grep -oP "auth\.js[?]v=\K[0-9.]+" profile-edit.html || echo "")
FINAL_AUTHJS_LOGIN=$(grep -oP "auth\.js[?]v=\K[0-9.]+" login/classic.html || echo "")
FINAL_COMPANIESJS=$(grep -oP "companies\.js[?]v=\K[0-9.]+" company.html || echo "")
FINAL_JSON=$(grep -oP '"version": "\K[^"]+' version.json || echo "")
FINAL_TIME=$(grep -oP "APP_RELEASE_TIME = '\K[^']+" index.html || echo "")

ALL_OK=true
check_ver() {  # $1=名称 $2=实际值
  if [ "$2" != "$NEW_VER" ]; then
    echo "❌ $1 不匹配: $2 (期望 $NEW_VER)"
    ALL_OK=false
  fi
}
check_ver "SW_VERSION(index.html)"       "$FINAL_SW"
check_ver "APP_VERSION(index.html)"      "$FINAL_APP"
check_ver "CACHE(sw.js)"                 "$FINAL_CACHE"
check_ver "app.js?v=(index.html)"        "$FINAL_APPJS"
check_ver "styles.css?v=(index.html)"    "$FINAL_CSS"
check_ver "auth.js?v=(index.html)"        "$FINAL_AUTHJS_INDEX"
check_ver "auth.js?v=(status.html)"       "$FINAL_AUTHJS_STATUS"
check_ver "auth.js?v=(profile.html)"      "$FINAL_AUTHJS_PROFILE"
check_ver "auth.js?v=(profile-edit.html)" "$FINAL_AUTHJS_PEDIT"
check_ver "auth.js?v=(login/classic.html)" "$FINAL_AUTHJS_LOGIN"
check_ver "companies.js?v=(company.html)" "$FINAL_COMPANIESJS"
check_ver "version.json"                 "$FINAL_JSON"
# 时间戳独立校验：应为本次发版时间戳且非空
if [ -z "$FINAL_TIME" ] || [ "$FINAL_TIME" != "$TIMESTAMP" ]; then
  echo "❌ APP_RELEASE_TIME 不匹配: '$FINAL_TIME' (期望 '$TIMESTAMP')"
  ALL_OK=false
fi

if [ "$ALL_OK" = true ]; then
  echo ""
  echo "🎉 发版准备完成！所有版本号已同步到 v$NEW_VER"
  echo ""
  # ★ 自动提交：提交信息主题固定带版本号（chore(release): v$NEW_VER），
  #   确保更新日志能从提交信息中提取到版本、绝不会出现「缺版本日志」的问题。
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    if [ -n "$DESC" ]; then
      git commit -m "chore(release): v$NEW_VER" -m "$DESC"
    else
      git commit -m "chore(release): v$NEW_VER 更新版本"
    fi
    echo "  ✅ 已自动提交（含版本号 v$NEW_VER）"
  else
    echo "  ⚠️  无文件改动，跳过提交"
  fi
  echo ""
  echo "下一步:"
  echo "  1. 本地验证: python3 -m http.server 8080"
  echo "  2. 推送 main:   git push origin main"
else
  echo ""
  echo "❌ 存在不一致，请手动检查上方输出"
  exit 1
fi
