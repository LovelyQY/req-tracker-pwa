#!/usr/bin/env bash
# 批次执行器：按批次号分批次清理内联脚本中的死代码残块
#
# 清理两类批量替换遗留的损坏行：
#   1) "[c];" + 孤立 "});" + 孤立 "}"      （解析期语法错误，整段脚本失效）
#   2) ", 2200);" [+ 孤立 "}" ]            （某次 setTimeout(...,2200) 调用被损坏残留）
#
# 用法:
#   ./batch-fix.sh 123A            执行批次 123-A（4 个核心 CRUD 页）
#   ./batch-fix.sh 123B            执行批次 123-B（基础数据域 5 页）
#   ./batch-fix.sh 123C            执行批次 123-C（更新日志页）
#   ./batch-fix.sh all             执行全部 3 个批次
#   ./batch-fix.sh --dry-run 123A  仅预览，不落盘
#
# 与 plans/批次123_[c]残留清理与冗余治理_执行清单.md 的批次划分一一对应。
# 修改后请按 RULES.md 用 ./release.sh 升版部署（release.sh 会自检 ?v= 一致性）。

set -euo pipefail
cd "$(dirname "$0")"

B123A="project.html project-version.html company.html department.html"
B123B="basic-data.html dictionary.html position.html user.html about.html"
B123C="changelog.html"

DRY=0
case "${1:-}" in
  --dry-run) DRY=1; BATCH="${2:-}";;
  *)        DRY=0; BATCH="${1:-}";;
esac

usage() { echo "用法: $0 [--dry-run] <123A|123B|123C|all>"; exit 1; }
[ -n "${BATCH:-}" ] || usage
case "$BATCH" in
  123A) FILES=$B123A ;;
  123B) FILES=$B123B ;;
  123C) FILES=$B123C ;;
  all)  FILES="$B123A $B123B $B123C" ;;
  *) usage ;;
esac

remove_artifacts() {
  python3 - "$1" "$DRY" <<'PYEOF'
import sys, re
fn = sys.argv[1]
dry = sys.argv[2] == "1"
lines = open(fn, encoding='utf-8').read().split('\n')
out = []
i = 0
removed = 0
def is_c(line):  return line.strip() == '[c];'
def is_timeout(line):
    return re.match(r'^,\s*\d+\);\s*}?$', line.strip()) is not None
while i < len(lines):
    if is_c(lines[i]):
        i += 1
        if i < len(lines) and lines[i].strip() == '});': i += 1
        if i < len(lines) and lines[i].strip() == '}': i += 1
        removed += 1; continue
    if is_timeout(lines[i]):
        # 单行 ",2200); }" 已整体匹配；两行 ", 2200);" + 孤立 "}" 需再删下一行
        i += 1
        if i < len(lines) and re.match(r'^\s*}\s*$', lines[i]): i += 1
        removed += 1; continue
    out.append(lines[i]); i += 1
if dry:
    print("  [dry-run] %s: 将移除残块 %d 处（不落盘）" % (fn, removed))
else:
    open(fn, 'w', encoding='utf-8').write('\n'.join(out))
    print("  %s: 移除残块 %d 处" % (fn, removed))
PYEOF
}

if [ "$DRY" = 1 ]; then LABEL="(dry-run)"; else LABEL=""; fi
echo "=== 执行批次 $BATCH $LABEL ==="
for f in $FILES; do
  [ -f "$f" ] || { echo "  [跳过] 文件不存在: $f"; continue; }
  remove_artifacts "$f"
done

if [ "$DRY" -eq 0 ]; then
  echo "=== 校验：HTML 页面剩余残块 ==="
  c_left=$(grep -rln '\[c\];' *.html 2>/dev/null || true)
  t_left=$(grep -rlE ',\s*[0-9]+\);\s*}?$' *.html 2>/dev/null || true)
  [ -z "$c_left" ] && echo "  [c];：OK 已全部清除" || { echo "  [c]; 仍存在："; echo "$c_left"; }
  [ -z "$t_left" ] && echo "  , 2200); 类：OK 已全部清除" || { echo "  , 2200); 类仍存在："; echo "$t_left"; }
  echo "=== 提示 ==="
  echo "  修改尚未提交。请按 RULES.md 用 ./release.sh 升版后部署。"
fi
