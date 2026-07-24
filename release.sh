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
  raw=$(git log --grep='chore(release): v' --grep='^release: v' --date=format-local:'%Y-%m-%d %H:%M' --pretty=format:'%cd%x1f%s%x1f%b%x1e' 2>/dev/null)
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

# ★ 规则强制：每次发版必须提供更新日志说明（DESC），禁止空正文（避免「漏了日志」）
if [ -z "$DESC" ]; then
  echo "❌ 发版说明（DESC）不能为空：每次发版都必须总结内容并更新更新日志。"
  echo "   用法: $0 <版本号> \"<一句话说明>\""
  echo "   例  : $0 1.3.26 \"新增某某功能\""
  exit 1
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
# 替换并即时校验：命中打印 ✅，未命中打印 ❌；若 sed 未产生任何改动（本页未引用该资源）则跳过（不误报）。
# 采用「替换前后文件比对」判断是否有引用，避免从 sed 表达式反推匹配模式带来的脆弱性。
patch_ver() {  # $1=文件 $2=sed表达式 $3=校验grep表达式 $4=名称
  local before
  before=$(cat "$1")
  sed -i "$2" "$1"
  if [ "$before" = "$(cat "$1")" ]; then
    # 文件内容未变化：本页未引用该资源 → 跳过，不误报
    echo "  ⏭️  $4 跳过（本页未引用该资源）"
  elif grep -q "$3" "$1"; then
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

# 3.7 基础数据页：db.js / companies.js / departments.js / positions.js 版本化 URL（缓存破坏随发版升级）
BASIC_COMPANY="company.html"
BASIC_POSITION="position.html"
BASIC_DEPARTMENT="department.html"
for f in $BASIC_COMPANY $BASIC_DEPARTMENT; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/companies\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/companies.js?v=$NEW_VER/g" "companies.js?v=$NEW_VER" "companies.js?v= → $NEW_VER ($f)"
done
for f in $BASIC_DEPARTMENT; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/departments\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/departments.js?v=$NEW_VER/g" "departments.js?v=$NEW_VER" "departments.js?v= → $NEW_VER ($f)"
done
for f in $BASIC_POSITION; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/dictionary\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/dictionary.js?v=$NEW_VER/g" "dictionary.js?v=$NEW_VER" "dictionary.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/positions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/positions.js?v=$NEW_VER/g" "positions.js?v=$NEW_VER" "positions.js?v= → $NEW_VER ($f)"
done
BASIC_PROJECT="project.html"
for f in $BASIC_PROJECT; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/companies\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/companies.js?v=$NEW_VER/g" "companies.js?v=$NEW_VER" "companies.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/departments\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/departments.js?v=$NEW_VER/g" "departments.js?v=$NEW_VER" "departments.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/projects\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/projects.js?v=$NEW_VER/g" "projects.js?v=$NEW_VER" "projects.js?v= → $NEW_VER ($f)"
  # 批次66：补齐 project.html 此前未注册的 dictionary.js ?v= 引用（漂移自检会拦截）
  patch_ver "$f" "s/dictionary\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/dictionary.js?v=$NEW_VER/g" "dictionary.js?v=$NEW_VER" "dictionary.js?v= → $NEW_VER ($f)"
done
BASIC_PROJECT_VERSION="project-version.html"
for f in $BASIC_PROJECT_VERSION; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/companies\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/companies.js?v=$NEW_VER/g" "companies.js?v=$NEW_VER" "companies.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/departments\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/departments.js?v=$NEW_VER/g" "departments.js?v=$NEW_VER" "departments.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/projects\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/projects.js?v=$NEW_VER/g" "projects.js?v=$NEW_VER" "projects.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/project-versions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/project-versions.js?v=$NEW_VER/g" "project-versions.js?v=$NEW_VER" "project-versions.js?v= → $NEW_VER ($f)"
  # 批次66：补齐 project-version.html 此前未注册的 dictionary.js ?v= 引用（漂移自检会拦截）
  patch_ver "$f" "s/dictionary\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/dictionary.js?v=$NEW_VER/g" "dictionary.js?v=$NEW_VER" "dictionary.js?v= → $NEW_VER ($f)"
done
BASIC_DICTIONARY="dictionary.html"
for f in $BASIC_DICTIONARY; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/dictionary\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/dictionary.js?v=$NEW_VER/g" "dictionary.js?v=$NEW_VER" "dictionary.js?v= → $NEW_VER ($f)"
done

# 批次90：基础数据各页 + basic-data.html 接入 permissions*.js（缓存破坏随发版升级）
BASIC_PERM_PAGES="company.html department.html position.html project.html project-version.html dictionary.html basic-data.html"
for f in $BASIC_PERM_PAGES; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/permissions-registry\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/permissions-registry.js?v=$NEW_VER/g" "permissions-registry.js?v=$NEW_VER" "permissions-registry.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/permissions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/permissions.js?v=$NEW_VER/g" "permissions.js?v=$NEW_VER" "permissions.js?v= → $NEW_VER ($f)"
done

# 批次91：报表页 / 个人信息 / 安全 / 存储备份 / 关于页 接入 permissions*.js（缓存破坏随发版升级）
BATCH91_PERM_PAGES="report-task.html report-bug.html report-todo.html report-meeting.html profile.html profile-detail.html profile-edit.html security.html storage-backup.html about.html"
for f in $BATCH91_PERM_PAGES; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/permissions-registry\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/permissions-registry.js?v=$NEW_VER/g" "permissions-registry.js?v=$NEW_VER" "permissions-registry.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/permissions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/permissions.js?v=$NEW_VER/g" "permissions.js?v=$NEW_VER" "permissions.js?v= → $NEW_VER ($f)"
done

# 3.7.x 权限管理相关页（角色管理 / 权限管理）：db.js / users.js / permissions*.js / 各自业务 JS 版本化 URL（缓存破坏随发版升级）
BASIC_ROLE="role.html"
BASIC_PERMISSION="permission.html"
for f in $BASIC_ROLE $BASIC_PERMISSION index.html; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/users\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/users.js?v=$NEW_VER/g" "users.js?v=$NEW_VER" "users.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/permissions-registry\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/permissions-registry.js?v=$NEW_VER/g" "permissions-registry.js?v=$NEW_VER" "permissions-registry.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/permissions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/permissions.js?v=$NEW_VER/g" "permissions.js?v=$NEW_VER" "permissions.js?v= → $NEW_VER ($f)"
done
for f in $BASIC_ROLE; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/role\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/role.js?v=$NEW_VER/g" "role.js?v=$NEW_VER" "role.js?v= → $NEW_VER ($f)"
done
for f in $BASIC_PERMISSION; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/permission\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/permission.js?v=$NEW_VER/g" "permission.js?v=$NEW_VER" "permission.js?v= → $NEW_VER ($f)"
done

# 3.5.5 人员管理页：db.js / departments.js / positions.js / users.js 版本化 URL（缓存破坏随发版升级）
BASIC_USER="user.html"
for f in $BASIC_USER; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/departments\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/departments.js?v=$NEW_VER/g" "departments.js?v=$NEW_VER" "departments.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/positions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/positions.js?v=$NEW_VER/g" "positions.js?v=$NEW_VER" "positions.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/dictionary\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/dictionary.js?v=$NEW_VER/g" "dictionary.js?v=$NEW_VER" "dictionary.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/users\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/users.js?v=$NEW_VER/g" "users.js?v=$NEW_VER" "users.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/permissions-registry\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/permissions-registry.js?v=$NEW_VER/g" "permissions-registry.js?v=$NEW_VER" "permissions-registry.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/permissions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/permissions.js?v=$NEW_VER/g" "permissions.js?v=$NEW_VER" "permissions.js?v= → $NEW_VER ($f)"
done

# 3.6 各页面: auth.js 版本化 URL（共享会话模块，缓存破坏随发版升级）
AUTH_PAGES="index.html status.html profile.html profile-detail.html profile-edit.html security.html login/classic.html company.html department.html position.html project.html project-version.html dictionary.html about.html changelog.html basic-data.html storage-backup.html user.html report.html report-task.html report-todo.html report-bug.html report-meeting.html role.html permission.html"
for f in $AUTH_PAGES; do
  if [ -f "$f" ]; then
    patch_ver "$f" "s/auth\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/auth.js?v=$NEW_VER/g" "auth.js?v=$NEW_VER" "auth.js?v= → $NEW_VER ($f)"
  fi
done

# 3.6.2 个人信息 / 登录页：db.js / users.js 版本化 URL（缓存破坏随发版升级）
PROFILE_PAGES="profile.html profile-detail.html profile-edit.html security.html login/classic.html"
for f in $PROFILE_PAGES; do
  if [ -f "$f" ]; then
    patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
    patch_ver "$f" "s/users\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/users.js?v=$NEW_VER/g" "users.js?v=$NEW_VER" "users.js?v= → $NEW_VER ($f)"
  fi
done

# 3.6.2.5 引用 imgstore.js 的页面：imgstore.js 版本化 URL（缓存破坏随发版升级）
IMGSTORE_PAGES="profile.html security.html index.html"
for f in $IMGSTORE_PAGES; do
  if [ -f "$f" ]; then
    patch_ver "$f" "s/imgstore\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/imgstore.js?v=$NEW_VER/g" "imgstore.js?v=$NEW_VER" "imgstore.js?v= → $NEW_VER ($f)"
  fi
done

# 3.6.3 个人信息页：departments.js / positions.js 版本化 URL（只读展示部门/职位名，缓存破坏随发版升级）
PROFILE_BASIC="profile-detail.html"
for f in $PROFILE_BASIC; do
  if [ -f "$f" ]; then
    patch_ver "$f" "s/departments\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/departments.js?v=$NEW_VER/g" "departments.js?v=$NEW_VER" "departments.js?v= → $NEW_VER ($f)"
    patch_ver "$f" "s/positions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/positions.js?v=$NEW_VER/g" "positions.js?v=$NEW_VER" "positions.js?v= → $NEW_VER ($f)"
  fi
done

# 3.6.5 存储与备份页：styles.css / storage-backup.js 版本化 URL（缓存破坏随发版升级）
SB_PAGE="storage-backup.html"
for f in $SB_PAGE; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/styles\.css[?]v=[0-9]*\.[0-9]*\.[0-9]*/styles.css?v=$NEW_VER/g" "styles.css?v=$NEW_VER" "styles.css?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/storage-backup\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/storage-backup.js?v=$NEW_VER/g" "storage-backup.js?v=$NEW_VER" "storage-backup.js?v= → $NEW_VER ($f)"
done

# 3.7.4 config.js 版本化 URL（新增配置模块，缓存破坏随发版升级；login 页为 ../config.js）
CONFIG_PAGES="index.html index-nosw.html profile.html profile-edit.html profile-detail.html security.html login/classic.html company.html department.html position.html project.html project-version.html dictionary.html user.html storage-backup.html report.html report-task.html report-todo.html report-bug.html report-meeting.html role.html permission.html"
for f in $CONFIG_PAGES; do
  if [ -f "$f" ]; then
    patch_ver "$f" "s/config\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/config.js?v=$NEW_VER/g" "config.js?v=$NEW_VER" "config.js?v= → $NEW_VER ($f)"
  fi
done

# 3.7.5 主应用页：db.js / changelog.js / dictionary.js 版本化 URL（更新日志表数据层、字典任务类型驱动，缓存破坏随发版升级）
INDEX_APP="index.html"
for f in $INDEX_APP; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/changelog\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/changelog.js?v=$NEW_VER/g" "changelog.js?v=$NEW_VER" "changelog.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/dictionary\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/dictionary.js?v=$NEW_VER/g" "dictionary.js?v=$NEW_VER" "dictionary.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/requirement-tasks\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/requirement-tasks.js?v=$NEW_VER/g" "requirement-tasks.js?v=$NEW_VER" "requirement-tasks.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/task-lifecycles\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/task-lifecycles.js?v=$NEW_VER/g" "task-lifecycles.js?v=$NEW_VER" "task-lifecycles.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/todos\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/todos.js?v=$NEW_VER/g" "todos.js?v=$NEW_VER" "todos.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/todo-lifecycles\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/todo-lifecycles.js?v=$NEW_VER/g" "todo-lifecycles.js?v=$NEW_VER" "todo-lifecycles.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/report\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/report.js?v=$NEW_VER/g" "report.js?v=$NEW_VER" "report.js?v= → $NEW_VER ($f)"
  # 批次66：补齐 index.html 此前未注册的 users.js / projects.js / project-versions.js ?v= 引用（漂移自检会拦截）
  patch_ver "$f" "s/users\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/users.js?v=$NEW_VER/g" "users.js?v=$NEW_VER" "users.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/projects\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/projects.js?v=$NEW_VER/g" "projects.js?v=$NEW_VER" "projects.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/project-versions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/project-versions.js?v=$NEW_VER/g" "project-versions.js?v=$NEW_VER" "project-versions.js?v= → $NEW_VER ($f)"
done

# 3.7.6 统计报表页：本页引用全部脚本的版本化 URL（缓存破坏随发版升级）
#      auth.js / config.js 已由 AUTH_PAGES / CONFIG_PAGES 覆盖；此处补齐报表页其余引用
REPORT_PAGE="report.html"
for f in $REPORT_PAGE; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/styles\.css[?]v=[0-9]*\.[0-9]*\.[0-9]*/styles.css?v=$NEW_VER/g" "styles.css?v=$NEW_VER" "styles.css?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/dictionary\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/dictionary.js?v=$NEW_VER/g" "dictionary.js?v=$NEW_VER" "dictionary.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/projects\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/projects.js?v=$NEW_VER/g" "projects.js?v=$NEW_VER" "projects.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/project-versions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/project-versions.js?v=$NEW_VER/g" "project-versions.js?v=$NEW_VER" "project-versions.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/requirement-tasks\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/requirement-tasks.js?v=$NEW_VER/g" "requirement-tasks.js?v=$NEW_VER" "requirement-tasks.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/task-lifecycles\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/task-lifecycles.js?v=$NEW_VER/g" "task-lifecycles.js?v=$NEW_VER" "task-lifecycles.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/todos\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/todos.js?v=$NEW_VER/g" "todos.js?v=$NEW_VER" "todos.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/todo-lifecycles\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/todo-lifecycles.js?v=$NEW_VER/g" "todo-lifecycles.js?v=$NEW_VER" "todo-lifecycles.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/users\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/users.js?v=$NEW_VER/g" "users.js?v=$NEW_VER" "users.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/report\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/report.js?v=$NEW_VER/g" "report.js?v=$NEW_VER" "report.js?v= → $NEW_VER ($f)"
done

# 3.7.7 四个独立报表页：各页引用全部脚本的版本化 URL（缓存破坏随发版升级）
#      auth.js / config.js / styles.css 已由 AUTH_PAGES / CONFIG_PAGES / 上文规则覆盖；此处补齐报表页其余引用
REPORT_SPLIT_PAGES="report-task.html report-todo.html report-bug.html report-meeting.html"
for f in $REPORT_SPLIT_PAGES; do
  [ -f "$f" ] || continue
  patch_ver "$f" "s/db\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/db.js?v=$NEW_VER/g" "db.js?v=$NEW_VER" "db.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/dictionary\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/dictionary.js?v=$NEW_VER/g" "dictionary.js?v=$NEW_VER" "dictionary.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/projects\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/projects.js?v=$NEW_VER/g" "projects.js?v=$NEW_VER" "projects.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/project-versions\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/project-versions.js?v=$NEW_VER/g" "project-versions.js?v=$NEW_VER" "project-versions.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/requirement-tasks\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/requirement-tasks.js?v=$NEW_VER/g" "requirement-tasks.js?v=$NEW_VER" "requirement-tasks.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/task-lifecycles\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/task-lifecycles.js?v=$NEW_VER/g" "task-lifecycles.js?v=$NEW_VER" "task-lifecycles.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/todos\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/todos.js?v=$NEW_VER/g" "todos.js?v=$NEW_VER" "todos.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/todo-lifecycles\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/todo-lifecycles.js?v=$NEW_VER/g" "todo-lifecycles.js?v=$NEW_VER" "todo-lifecycles.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/users\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/users.js?v=$NEW_VER/g" "users.js?v=$NEW_VER" "users.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/companies\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/companies.js?v=$NEW_VER/g" "companies.js?v=$NEW_VER" "companies.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/departments\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/departments.js?v=$NEW_VER/g" "departments.js?v=$NEW_VER" "departments.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/report-common\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/report-common.js?v=$NEW_VER/g" "report-common.js?v=$NEW_VER" "report-common.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/report-task\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/report-task.js?v=$NEW_VER/g" "report-task.js?v=$NEW_VER" "report-task.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/report-todo\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/report-todo.js?v=$NEW_VER/g" "report-todo.js?v=$NEW_VER" "report-todo.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/report-bug\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/report-bug.js?v=$NEW_VER/g" "report-bug.js?v=$NEW_VER" "report-bug.js?v= → $NEW_VER ($f)"
  patch_ver "$f" "s/report-meeting\.js[?]v=[0-9]*\.[0-9]*\.[0-9]*/report-meeting.js?v=$NEW_VER/g" "report-meeting.js?v=$NEW_VER" "report-meeting.js?v= → $NEW_VER ($f)"
  # 批次65：补齐历史盲区——本段此前未覆盖 styles.css?v=（index.html/storage-backup.html/report.html 各有专属处理，拆分报表页遗漏），导致发版后这些页仍命中旧 CSS 缓存
  patch_ver "$f" "s/styles\.css[?]v=[0-9]*\.[0-9]*\.[0-9]*/styles.css?v=$NEW_VER/g" "styles.css?v=$NEW_VER" "styles.css?v= → $NEW_VER ($f)"
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

# ========== §1.8 权限注册表自检：扫描 data-perm 取值 ==========
echo ""
echo "  权限注册表自检（§1.8）：扫描所有 data-perm 取值..."
# 从 permissions-registry.js 提取所有注册表 code（module / page / op 叶子）
PERM_REGISTRY_CODES=$(node -e "
  var src = require('fs').readFileSync('permissions-registry.js','utf8');
  var m = {}; (0,eval)(src);
  var api = (m.exports || globalThis.RT_PERM_REGISTRY_API);
  console.log(api.flattenRegistryCodes().join('\n'));
" 2>/dev/null)
if [ -z "$PERM_REGISTRY_CODES" ]; then
  echo "  ⚠ 无法解析权限注册表，跳过 data-perm 自检"
else
  UNREGISTERED_FOUND=false
  # 扫描 HTML/JS 文件中的 data-perm 属性值
  for f in $(ls *.html *.js 2>/dev/null); do
    [ -f "$f" ] || continue
    # 提取 data-perm="value1,value2" 中的每个 code
    PERM_VALS=$(grep -oP 'data-perm="([^"]*)"' "$f" 2>/dev/null | sed 's/data-perm="//;s/"$//' | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sort -u || true)
    for code in $PERM_VALS; do
      [ -z "$code" ] && continue
      # 跳过非 snake_case 值（如 JS 拼接表达式 ' + m.perm + '）
      if ! [[ "$code" =~ ^[a-z_][a-z_0-9]*$ ]]; then continue; fi
      if ! echo "$PERM_REGISTRY_CODES" | grep -qxF "$code"; then
        echo "  ❌ $f: data-perm=\"$code\" 未在注册表中登记！"
        UNREGISTERED_FOUND=true
      fi
    done
  done
  if $UNREGISTERED_FOUND; then
    echo "❌ 发版阻断：存在未在 permissions-registry.js 中登记的 data-perm 取值"
    echo "   请先在权限注册表中添加对应 code，再重新发版（§1.8 强规则）"
    exit 1
  else
    echo "  ✅ 所有 data-perm 取值均在注册表中命中"
  fi
fi

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
FINAL_DBJS=$(grep -oP "db\.js[?]v=\K[0-9.]+" company.html || echo "")
FINAL_POSITIONSJS=$(grep -oP "positions\.js[?]v=\K[0-9.]+" position.html || echo "")
FINAL_DICTDBJS=$(grep -oP "db\.js[?]v=\K[0-9.]+" dictionary.html || echo "")
FINAL_DICTJS=$(grep -oP "dictionary\.js[?]v=\K[0-9.]+" dictionary.html || echo "")
FINAL_ABOUTAUTHJS=$(grep -oP "auth\.js[?]v=\K[0-9.]+" about.html || echo "")
FINAL_CLOGAUTHJS=$(grep -oP "auth\.js[?]v=\K[0-9.]+" changelog.html || echo "")
FINAL_DBJS_INDEX=$(grep -oP "db\.js[?]v=\K[0-9.]+" index.html || echo "")
FINAL_CHANGELOGJS_INDEX=$(grep -oP "changelog\.js[?]v=\K[0-9.]+" index.html || echo "")
FINAL_DICTJS_INDEX=$(grep -oP "dictionary\.js[?]v=\K[0-9.]+" index.html || echo "")
# 批次66：补齐 index.html 遗漏资源的最终一致性校验变量
FINAL_USERSJS_INDEX=$(grep -oP "users\.js[?]v=\K[0-9.]+" index.html || echo "")
FINAL_PROJECTSJS_INDEX=$(grep -oP "projects\.js[?]v=\K[0-9.]+" index.html || echo "")
FINAL_PVJS_INDEX=$(grep -oP "project-versions\.js[?]v=\K[0-9.]+" index.html || echo "")
# 批次66：补齐 project.html / project-version.html 遗漏资源的最终一致性校验变量
FINAL_DICTJS_PROJECT=$(grep -oP "dictionary\.js[?]v=\K[0-9.]+" project.html || echo "")
FINAL_DICTJS_PV=$(grep -oP "dictionary\.js[?]v=\K[0-9.]+" project-version.html || echo "")
FINAL_DBJS_PROFILE=$(grep -oP "db\.js[?]v=\K[0-9.]+" profile.html || echo "")
FINAL_USERSJS_PROFILE=$(grep -oP "users\.js[?]v=\K[0-9.]+" profile.html || echo "")
FINAL_DEPTJS_DETAIL=$(grep -oP "departments\.js[?]v=\K[0-9.]+" profile-detail.html || echo "")
FINAL_POSJS_DETAIL=$(grep -oP "positions\.js[?]v=\K[0-9.]+" profile-detail.html || echo "")
FINAL_DBJS_PEDIT=$(grep -oP "db\.js[?]v=\K[0-9.]+" profile-edit.html || echo "")
FINAL_USERSJS_PEDIT=$(grep -oP "users\.js[?]v=\K[0-9.]+" profile-edit.html || echo "")
FINAL_DBJS_LOGIN=$(grep -oP "db\.js[?]v=\K[0-9.]+" login/classic.html || echo "")
FINAL_USERSJS_LOGIN=$(grep -oP "users\.js[?]v=\K[0-9.]+" login/classic.html || echo "")
FINAL_IMGSTORE_PROFILE=$(grep -oP "imgstore\.js[?]v=\K[0-9.]+" profile.html || echo "")
FINAL_IMGSTORE_INDEX=$(grep -oP "imgstore\.js[?]v=\K[0-9.]+" index.html || echo "")
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
check_ver "db.js?v=(company.html)" "$FINAL_DBJS"
check_ver "positions.js?v=(position.html)" "$FINAL_POSITIONSJS"
check_ver "db.js?v=(dictionary.html)"    "$FINAL_DICTDBJS"
check_ver "dictionary.js?v=(dictionary.html)" "$FINAL_DICTJS"
check_ver "auth.js?v=(about.html)"       "$FINAL_ABOUTAUTHJS"
check_ver "auth.js?v=(changelog.html)"   "$FINAL_CLOGAUTHJS"
check_ver "db.js?v=(index.html)"          "$FINAL_DBJS_INDEX"
check_ver "changelog.js?v=(index.html)"   "$FINAL_CHANGELOGJS_INDEX"
check_ver "dictionary.js?v=(index.html)"  "$FINAL_DICTJS_INDEX"
# 批次66：补齐 index.html 遗漏资源的最终一致性校验断言
check_ver "users.js?v=(index.html)"          "$FINAL_USERSJS_INDEX"
check_ver "projects.js?v=(index.html)"       "$FINAL_PROJECTSJS_INDEX"
check_ver "project-versions.js?v=(index.html)" "$FINAL_PVJS_INDEX"
# 批次66：补齐 project.html / project-version.html 遗漏资源的最终一致性校验断言
check_ver "dictionary.js?v=(project.html)"   "$FINAL_DICTJS_PROJECT"
check_ver "dictionary.js?v=(project-version.html)" "$FINAL_DICTJS_PV"
check_ver "db.js?v=(profile.html)"        "$FINAL_DBJS_PROFILE"
check_ver "users.js?v=(profile.html)"     "$FINAL_USERSJS_PROFILE"
check_ver "departments.js?v=(profile-detail.html)" "$FINAL_DEPTJS_DETAIL"
check_ver "positions.js?v=(profile-detail.html)" "$FINAL_POSJS_DETAIL"
check_ver "db.js?v=(profile-edit.html)"   "$FINAL_DBJS_PEDIT"
check_ver "users.js?v=(profile-edit.html)" "$FINAL_USERSJS_PEDIT"
check_ver "db.js?v=(login/classic.html)"  "$FINAL_DBJS_LOGIN"
check_ver "users.js?v=(login/classic.html)" "$FINAL_USERSJS_LOGIN"
check_ver "imgstore.js?v=(profile.html)"  "$FINAL_IMGSTORE_PROFILE"
check_ver "imgstore.js?v=(index.html)"    "$FINAL_IMGSTORE_INDEX"
check_ver "version.json"                 "$FINAL_JSON"
# 时间戳独立校验：应为本次发版时间戳且非空
if [ -z "$FINAL_TIME" ] || [ "$FINAL_TIME" != "$TIMESTAMP" ]; then
  echo "❌ APP_RELEASE_TIME 不匹配: '$FINAL_TIME' (期望 '$TIMESTAMP')"
  ALL_OK=false
fi

# 全站 ?v= 漂移自检（兜底）：扫描每个 HTML 中所有 *.js?v= / *.css?v=，必须全部等于 NEW_VER
# —— 任何未在 release.sh 注册的页面/资源引用，都会在此暴露并中断发版，杜绝「版本未更新/遗漏」。
for f in *.html; do
  [ -f "$f" ] || continue
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    if [ "$ref" != "$NEW_VER" ]; then
      echo "❌ $f 存在过期 ?v= 引用: $ref (期望 $NEW_VER)"
      ALL_OK=false
    fi
  done < <(grep -oE '(js|css)\?v=[0-9]+\.[0-9]+\.[0-9]+' "$f" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
done

# （可选增强）缺失 ?v= 告警：本地 *.js / *.css 引用若不带 ?v= 则提醒（仅提示，不阻断发版）
for f in *.html; do
  [ -f "$f" ] || continue
  while IFS= read -r tag; do
    [ -n "$tag" ] || continue
    echo "⚠️  $f 引用本地资源但缺少 ?v= 版本标识: $tag"
  done < <(grep -oE '(src|href)="[^"]*\.(js|css)(\?[^"]*)?"' "$f" | grep -vE '\?v=')
done

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
