#!/bin/bash
# req-tracker-pwa 一键发版脚本
# 用法: ./release.sh <版本号> [时间戳]
# 示例: ./release.sh 1.0.37 "2026-07-13 10:00"
#       ./release.sh 1.0.37          # 时间戳自动取当前时间

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ---------- 参数校验 ----------
if [ $# -lt 1 ]; then
  echo "❌ 用法: $0 <X.Y.Z> [YYYY-MM-DD HH:MM]"
  echo "   示例: $0 1.0.37"
  echo "         $0 1.0.37 \"2026-07-13 10:00\""
  exit 1
fi

NEW_VER="$1"
if ! [[ "$NEW_VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ 版本号格式错误，要求 X.Y.Z（如 1.0.37），收到: $NEW_VER"
  exit 1
fi

# 时间戳：未提供则自动生成
if [ -n "${2:-}" ]; then
  TIMESTAMP="$2"
else
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
  echo "⚠️  警告: index.html 中 SW_VERSION 出现 $OLD_VER_COUNT 次（预期 1 次）"
fi

APP_VER_COUNT=$(grep -c "APP_VERSION = '[0-9]\+\.[0-9]\+\.[0-9]\+'" index.html || true)
if [ "$APP_VER_COUNT" -ne 1 ]; then
  echo "⚠️  警告: index.html 中 APP_VERSION 出现 $APP_VER_COUNT 次（预期 1 次）"
fi

CACHE_COUNT=$(grep -c "CACHE = 'req-tracker-v[0-9]\+\.[0-9]\+\.[0-9]+'" sw.js || true)
if [ "$CACHE_COUNT" -ne 1 ]; then
  echo "⚠️  警告: sw.js 中 CACHE 出现 $CACHE_COUNT 次（预期 1 次）"
fi

RELEASE_TIME_COUNT=$(grep -c "APP_RELEASE_TIME = '" index.html || true)
if [ "$RELEASE_TIME_COUNT" -ne 1 ]; then
  echo "⚠️  警告: index.html 中 APP_RELEASE_TIME 出现 $RELEASE_TIME_COUNT 次（预期 1 次）"
  # 如果有 req-tracker.html 可能是 2，但我们已删除它，所以应该是 1
fi

echo "✅ 文件检查通过，开始替换..."
echo ""

# ---------- 执行替换 ----------
# 1. index.html: SW_VERSION
sed -i "s/SW_VERSION = '[0-9]*\.[0-9]*\.[0-9]*'/SW_VERSION = '$NEW_VER'/g" index.html
echo "  ✅ SW_VERSION → $NEW_VER (index.html)"

# 2. index.html: APP_VERSION
sed -i "s/APP_VERSION = '[0-9]*\.[0-9]*\.[0-9]*'/APP_VERSION = '$NEW_VER'/g" index.html
echo "  ✅ APP_VERSION → $NEW_VER (index.html)"

# 3. sw.js: CACHE 名称
sed -i "s/CACHE = 'req-tracker-v[0-9]*\.[0-9]*\.[0-9]*'/CACHE = 'req-tracker-v$NEW_VER'/g" sw.js
echo "  ✅ CACHE → req-tracker-v$NEW_VER (sw.js)"

# 3.5 index.html: 资源版本化 URL（app.js / styles.css 缓存破坏，避免刷新仍是旧版）
sed -i "s/app\.js?v=[0-9]*\.[0-9]*\.[0-9]*/app.js?v=$NEW_VER/g" index.html
echo "  ✅ app.js?v= → $NEW_VER (index.html)"
sed -i "s/styles\.css?v=[0-9]*\.[0-9]*\.[0-9]*/styles.css?v=$NEW_VER/g" index.html
echo "  ✅ styles.css?v= → $NEW_VER (index.html)"

# 4. index.html: APP_RELEASE_TIME（离线回退值）
sed -i "s/APP_RELEASE_TIME = '[^']*'/APP_RELEASE_TIME = '$TIMESTAMP'/g" index.html
echo "  ✅ APP_RELEASE_TIME → $TIMESTAMP (index.html)"

# 4.5 version.json：同源版本清单，供前端自动检测新版本
cat > version.json <<JSON
{
  "version": "$NEW_VER",
  "time": "$TIMESTAMP"
}
JSON
echo "  ✅ version.json → $NEW_VER"

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

# 最终一致性校验
FINAL_SW=$(grep -oP "SW_VERSION = '\K[^']+" index.html || echo "")
FINAL_APP=$(grep -oP "APP_VERSION = '\K[^']+" index.html || echo "")
FINAL_CACHE=$(grep -oP "CACHE = 'req-tracker-v\K[^']+" sw.js || echo "")

ALL_OK=true
if [ "$FINAL_SW" != "$NEW_VER" ]; then
  echo "❌ SW_VERSION 不匹配: $FINAL_SW (期望 $NEW_VER)"
  ALL_OK=false
fi
if [ "$FINAL_APP" != "$NEW_VER" ]; then
  echo "❌ APP_VERSION 不匹配: $FINAL_APP (期望 $NEW_VER)"
  ALL_OK=false
fi
if [ "$FINAL_CACHE" != "$NEW_VER" ]; then
  echo "❌ CACHE 不匹配: $FINAL_CACHE (期望 $NEW_VER)"
  ALL_OK=false
fi

if [ "$ALL_OK" = true ]; then
  echo ""
  echo "🎉 发版准备完成！所有版本号已同步到 v$NEW_VER"
  echo ""
  echo "下一步:"
  echo "  1. 本地验证: python3 -m http.server 8080"
  echo "  2. 提交代码:   git add -A && git commit -m \"chore(release): v$NEW_VER 更新版本\""
  echo "  3. 推送 main:   git push origin main"
else
  echo ""
  echo "❌ 存在不一致，请手动检查上方输出"
  exit 1
fi
