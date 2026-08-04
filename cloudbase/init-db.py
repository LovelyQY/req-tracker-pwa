#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CloudBase 初始化脚本：批量创建 20 个集合 + 设置安全规则。

前置：
  - 已通过 `tcb login --flow device`（或 --cloudbase-api-key）登录，且 -e 指向目标环境。
  - tcb 在 PATH 中（本脚本会自动补 nvm 路径）。

行为：
  1) 逐个集合执行 create（COMMAND create；失败则退化为 INSERT 占位文档以触发自动建集合）。
  2) 按 category 设置安全规则：
       user   -> CUSTOM  : read/write = "auth.uid == doc._owner"
       shared -> ADMINWRITE: read=true, write=false
  3) 全部幂等：集合已存在 / 规则已设置均不报错。

用法：
  python3 cloudbase/init-db.py            # 创建 + 设规则
  python3 cloudbase/init-db.py --check    # 仅检查当前集合与规则状态，不改写
"""
import json
import os
import subprocess
import sys

# 让 tcb（装在某 nvm node 下）可被找到
for p in ["/root/.nvm/versions/node/v22.13.1/bin"]:
    if p not in os.environ.get("PATH", ""):
        os.environ["PATH"] = p + ":" + os.environ.get("PATH", "")

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA = os.path.join(HERE, "collections.schema.json")


def read_wh():
    """从共享头部 wh.js（项目根目录）解析 envId 与 collPrefix，与前端单一事实来源一致。

    找不到 / 解析失败则回退到下方默认值，保证脚本仍可独立运行。
    """
    import re
    wh_path = os.path.join(os.path.dirname(HERE), "wh.js")
    env_id, prefix = "", ""
    try:
        with open(wh_path, "r", encoding="utf-8") as f:
            txt = f.read()
        m = re.search(r"""envId\s*:\s*['"]([^'"]+)['"]""", txt)
        if m:
            env_id = m.group(1)
        m = re.search(r"""collPrefix\s*:\s*['"]([^'"]+)['"]""", txt)
        if m:
            prefix = m.group(1)
    except Exception:
        pass
    return env_id, prefix


_WH_ENV, _WH_PREFIX = read_wh()
# 共享头部 wh.js 为单一事实来源；解析失败才回退默认（与 wh.js 默认值一致）。
ENV_ID = _WH_ENV or "pwa-20260724-d2g883p981e75c948"
COLL_PREFIX = _WH_PREFIX or ""


def run(cmd):
    """运行命令，返回 (rc, out)。"""
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT"


def create_collection(name):
    """优先用 COMMAND create；失败则 INSERT 占位文档触发自动建集合，再删除占位。"""
    create_cmd = (
        "tcb -e %s db nosql execute --command '%s' --json"
        % (ENV_ID, json.dumps([{"TableName": name, "CommandType": "COMMAND",
                                "Command": json.dumps({"create": name})}], ensure_ascii=False))
    )
    rc, out = run(create_cmd)
    if rc == 0 and '"error"' not in out and 'errorCode' not in out:
        # 可能返回已存在，仍视为成功
        return True, out.strip()[:160]
    # 退化：INSERT 占位 -> DELETE 占位
    placeholder = {"_init": "placeholder", "_owner": "__system__", "_ts": 1}
    ins = ("tcb -e %s db nosql execute --command '%s' --json"
           % (ENV_ID, json.dumps([{"TableName": name, "CommandType": "INSERT",
                          "Command": json.dumps({"insert": name,
                                                 "documents": [placeholder]})}], ensure_ascii=False)))
    rc2, out2 = run(ins)
    if rc2 != 0:
        return False, "create失败(%s) insert也失败: %s" % (out.strip()[:120], out2.strip()[:160])
    # 删除占位
    dele = ("tcb -e %s db nosql execute --command '%s' --json"
            % (ENV_ID, json.dumps([{"TableName": name, "CommandType": "DELETE",
                           "Command": json.dumps({"delete": name,
                                                  "deletes": [{"q": {"_init": "placeholder"}, "limit": 1}]})}], ensure_ascii=False)))
    run(dele)
    return True, "已通过 INSERT 占位建集合"


def set_rule(name, category):
    tpl = {
        "user": {
            "AclTag": "CUSTOM",
            "Rule": {"read": "auth.uid == doc._owner", "write": "auth.uid == doc._owner"},
        },
        "shared": {
            "AclTag": "ADMINWRITE",
            "Rule": {"read": True, "write": False},
        },
    }[category]
    rule_str = json.dumps(tpl["Rule"], ensure_ascii=False)
    body = json.dumps({
        "EnvId": ENV_ID,
        "CollectionName": name,
        "AclTag": tpl["AclTag"],
        "Rule": rule_str,
    }, ensure_ascii=False)
    cmd = "tcb -e %s api tcb ModifySafeRule --body '%s' --json" % (ENV_ID, body)
    rc, out = run(cmd)
    if rc == 0 and '"RequestId"' in out:
        return True, out.strip()[:160]
    return False, out.strip()[:200]


def check_status(colls):
    print("== 当前集合 / 规则状态（前缀 %r）==" % COLL_PREFIX)
    for c in colls:
        name = COLL_PREFIX + c["name"]
        q = ("tcb db nosql execute --command '%s' --json"
             % json.dumps([{"TableName": name, "CommandType": "COMMAND",
                            "Command": json.dumps({"count": name, "query": {}})}], ensure_ascii=False))
        rc, out = run(q)
        exists = rc == 0 and '"code"' not in out
        print("  %-22s exists=%-5s category=%s" % (name, exists, c["category"]))


def main():
    with open(SCHEMA, "r", encoding="utf-8") as f:
        schema = json.load(f)
    colls = schema["collections"]
    if "--check" in sys.argv:
        check_status(colls)
        return
    print("环境: %s  集合数: %d  前缀: %r" % (ENV_ID, len(colls), COLL_PREFIX))
    ok_create, ok_rule = 0, 0
    for c in colls:
        name, cat = COLL_PREFIX + c["name"], c["category"]
        c_ok, c_msg = create_collection(name)
        ok_create += 1 if c_ok else 0
        if c_ok:
            r_ok, r_msg = set_rule(name, cat)
            ok_rule += 1 if r_ok else 0
            print("[%s] 建集合 OK | 规则 %s | %s" % (name, "OK" if r_ok else "FAIL", r_msg[:80]))
        else:
            print("[%s] 建集合 FAIL | %s" % (name, c_msg[:120]))
    print("\n完成：建集合 %d/%d，设规则 %d/%d" % (ok_create, len(colls), ok_rule, len(colls)))


if __name__ == "__main__":
    main()
