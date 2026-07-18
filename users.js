// users.js —— 人员（用户）表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块注册 'users' store。
// 职责按页面拆分（见 RULES / 需求）：
//   · 人员管理页：仅维护「人员 ↔ 部门 / 职位」关系与基础身份（工号 / 姓名），
//     对应 createPerson / updatePerson / validatePerson。
//   · 个人信息页：维护其余资料（账号 / 昵称 / 密码 / 手机 / 邮箱 / 标签 / 个性签名 / 头像），
//     对应 updateProfile / validateProfile。
//
// 字段：
//   id / account(账号) / employeeNo(工号) / nickname(昵称) / name(姓名)
//   password(密码, SHA-256 哈希) / departmentId / positionId
//   phone / email / tags / signature(个性签名) / avatar
//   createdBy / createdAt / updatedBy / updatedAt
//
// 约定：
//   · 人员管理新建人员时 account 自动取 工号(employeeNo)，默认密码 sha256("123")。
//   · 登录可由 account 或 employeeNo 识别（见 login 页与 getUserByAccount / getUserByEmployeeNo）。
//   · 迁移：migrateAccounts() 把 localStorage 已有账号(rt_accounts) 一次性导入，密码沿用 pwdHash。
(function (root) {
  'use strict';

  var STORE = 'users';
  var LIMITS = {
    ACCOUNT_MIN: 4, ACCOUNT_MAX: 20,
    NICKNAME_MAX: 10, NAME_MAX: 30,
    PW_MIN: 8, PW_MAX: 20,
    EMPLOYEE_NO_MAX: 30, TAGS_MAX: 100, SIGNATURE_MAX: 100, AVATAR_MAX: 100,
    EMAIL_MAX: 60
  };
  var DEFAULT_PASSWORD = '123';
  var MIGRATED_FLAG = 'rt_users_migrated_v1';
  var ACCOUNTS_KEY = 'rt_accounts';

  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'account', path: 'account' },
        { name: 'employeeNo', path: 'employeeNo' },
        { name: 'email', path: 'email' },
        { name: 'departmentId', path: 'departmentId' },
        { name: 'positionId', path: 'positionId' },
        { name: 'nickname', path: 'nickname' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  // ===================== 校验常量 =====================
  var RE_ACCOUNT    = /^[A-Za-z0-9._@-]{4,20}$/;
  var RE_PW_CHARSET = /^[A-Za-z0-9@._#]{8,20}$/;
  var RE_PW_UPPER   = /[A-Z]/;
  var RE_PW_LOWER   = /[a-z]/;
  var RE_PW_DIG     = /[0-9]/;
  var RE_PW_SYM     = /[@._#]/;
  var RE_PHONE      = /^1[3-9]\d{9}$/;
  var RE_EMAIL      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function isPwOk(v) {
    if (v.length < LIMITS.PW_MIN || v.length > LIMITS.PW_MAX) return false;
    if (!RE_PW_CHARSET.test(v)) return false;
    if (!RE_PW_UPPER.test(v) || !RE_PW_LOWER.test(v) || !RE_PW_DIG.test(v) || !RE_PW_SYM.test(v)) return false;
    return true;
  }

  // ===================== 人员管理校验（工号 / 姓名 / 部门 / 职位）=====================
  function validatePerson(data) {
    var errors = {};
    data = data || {};
    var employeeNo   = (data.employeeNo == null ? '' : String(data.employeeNo)).trim();
    var name         = (data.name == null ? '' : String(data.name)).trim();
    var departmentId = (data.departmentId == null ? '' : String(data.departmentId));
    var positionId   = (data.positionId == null ? '' : String(data.positionId)).trim();

    if (!employeeNo) errors.employeeNo = '请输入工号';
    else if (employeeNo.length > LIMITS.EMPLOYEE_NO_MAX) errors.employeeNo = '工号最多 ' + LIMITS.EMPLOYEE_NO_MAX + ' 位';

    if (!name) errors.name = '请输入姓名';
    else if (name.length > LIMITS.NAME_MAX) errors.name = '姓名最多 ' + LIMITS.NAME_MAX + ' 位';

    if (!departmentId) errors.departmentId = '请选择部门';

    if (positionId.length > LIMITS.EMPLOYEE_NO_MAX) errors.positionId = '职位ID 过长';

    var first = null;
    ['employeeNo', 'name', 'departmentId', 'positionId'].forEach(function (k) { if (errors[k] && !first) first = k; });
    return { ok: Object.keys(errors).length === 0, errors: errors, first: first };
  }

  // ===================== 个人信息校验（账号 / 昵称 / 密码 / 手机 / 邮箱 / 标签 / 个性签名 / 头像）=====================
  // 采用「按需校验」：仅校验 patch 中实际携带的字段，便于「个人信息」页按字段单独编辑，
  // 不会因其它字段（如邮箱）暂为空而阻断昵称等单字段保存。
  function validateProfile(patch) {
    var errors = {};
    patch = patch || {};
    function has(k){ return Object.prototype.hasOwnProperty.call(patch, k); }

    if (has('account')) {
      var account = (patch.account == null ? '' : String(patch.account)).trim();
      if (account && !RE_ACCOUNT.test(account)) errors.account = '账号须 4-20 位，仅含英文、数字、. _ - @';
      else if (account.length > LIMITS.ACCOUNT_MAX) errors.account = '账号最多 ' + LIMITS.ACCOUNT_MAX + ' 位';
    }
    if (has('nickname')) {
      var nickname = (patch.nickname == null ? '' : String(patch.nickname)).trim();
      if (nickname && nickname.length > LIMITS.NICKNAME_MAX) errors.nickname = '昵称最多 ' + LIMITS.NICKNAME_MAX + ' 位';
    }
    if (has('password')) {
      var password = (patch.password == null ? '' : String(patch.password));
      if (password && !isPwOk(password)) errors.password = '密码须 8-20 位且含大小写、数字、符号(@._#)';
    }
    if (has('phone')) {
      var phone = (patch.phone == null ? '' : String(patch.phone)).trim();
      if (phone && !RE_PHONE.test(phone)) errors.phone = '手机号格式不正确（11 位，1 开头）';
    }
    if (has('email')) {
      var email = (patch.email == null ? '' : String(patch.email)).trim();
      if (email && !RE_EMAIL.test(email)) errors.email = '邮箱格式不正确';
      else if (email.length > LIMITS.EMAIL_MAX) errors.email = '邮箱最多 ' + LIMITS.EMAIL_MAX + ' 位';
    }
    if (has('tags')) {
      var tags = (patch.tags == null ? '' : String(patch.tags)).trim();
      if (tags.length > LIMITS.TAGS_MAX) errors.tags = '标签最多 ' + LIMITS.TAGS_MAX + ' 位';
    }
    if (has('signature')) {
      var signature = (patch.signature == null ? '' : String(patch.signature)).trim();
      if (signature.length > LIMITS.SIGNATURE_MAX) errors.signature = '个性签名最多 ' + LIMITS.SIGNATURE_MAX + ' 位';
    }
    if (has('avatar')) {
      var avatar = (patch.avatar == null ? '' : String(patch.avatar)).trim();
      if (avatar.length > LIMITS.AVATAR_MAX) errors.avatar = '头像地址过长';
    }

    var first = null;
    ['account', 'nickname', 'password', 'phone', 'email', 'tags', 'signature', 'avatar']
      .forEach(function (k) { if (errors[k] && !first) first = k; });
    return { ok: Object.keys(errors).length === 0, errors: errors, first: first };
  }

  // ===================== IndexedDB 底层 =====================
  function openDB() { return root.RT_DB.openDB(); }
  function tx(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }
  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }
  function sha256(str) {
    if (!(root.crypto && root.crypto.subtle && root.crypto.subtle.digest)) {
      return Promise.reject(new Error('当前环境不支持密码加密，请在 https 或 localhost 下使用'));
    }
    return root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }
  function defaultHash() { return sha256(DEFAULT_PASSWORD); }

  // ===================== 人员管理：新增 =====================
  function createPerson(data, operator) {
    var v = validatePerson(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var employeeNo = (data.employeeNo + '').trim();
    var name = (data.name + '').trim();
    var departmentId = (data.departmentId == null ? '' : String(data.departmentId));
    var positionId = (data.positionId == null ? '' : String(data.positionId)).trim();
    var account = (data.account == null ? '' : String(data.account)).trim();
    var op = (operator == null ? '' : String(operator));
    // ★ 同 updatePerson：用 try/finally 统一释放 db 连接，杜绝「保存无反应」
    return openDB().then(function (db) {
      var closed = false;
      function safeClose(){ if (closed) return; closed = true; try { db.close(); } catch (_) {} }
      function onErr(err){ safeClose(); throw err; }
      try {
        return Promise.all([
          getUserByAccountOnDB(db, account),
          getUserByEmployeeNoOnDB(db, employeeNo)
        ]).then(function (res) {
          if (res[0]) throw new Error('该账号已存在');
          if (res[1]) throw new Error('该工号已存在');
          return defaultHash().then(function (hash) {
            var now = Date.now();
            var record = {
              id: root.RT_DB.genId(),
              account: account,
              employeeNo: employeeNo,
              nickname: (data.nickname == null ? '' : String(data.nickname)).trim(),
              name: name,
              password: hash,                    // 默认密码 sha256("123")
              departmentId: departmentId,
              positionId: positionId,
              phone: '', email: '', tags: '', signature: '', avatar: '',
              createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
            };
            return reqToPromise(tx(db, 'readwrite').put(record)).then(function () {
              safeClose();
              return record;
            }, onErr);
          }, onErr);
        }, onErr);
      } catch (syncErr) {
        safeClose();
        throw syncErr;
      }
    });
  }

  // ===================== 人员管理：编辑（仅 工号 / 姓名 / 部门 / 职位）=====================
  function updatePerson(id, data, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validatePerson(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var employeeNo = (data.employeeNo + '').trim();
    var name = (data.name + '').trim();
    var departmentId = (data.departmentId == null ? '' : String(data.departmentId));
    var positionId = (data.positionId == null ? '' : String(data.positionId)).trim();
    var op = (operator == null ? '' : String(operator));
    // ★ 用 try/finally 统一管理 db.close,保证「无论成功/失败/分支 throw」连接一定会被释放,
    //   避免旧版本里 catch 里再 close 与前面 close 重复、或 finally 漏掉导致连接泄漏
    //   —— 这是「编辑人员保存无反应」历史 BUG 的根因之一（IndexedDB onblocked / 连接泄漏）
    return openDB().then(function (db) {
      var closed = false;
      function safeClose(){
        if (closed) return;
        closed = true;
        try { db.close(); } catch (_) {}
      }
      function onTxError(err){
        safeClose();
        throw err;
      }
      try {
        return reqToPromise(tx(db, 'readwrite').get(id)).then(function (old) {
          if (!old) throw new Error('记录不存在');
          // 工号唯一性（排除自身）—— 复用当前 db 连接，避免 openDB 触发 onblocked
          return getUserByEmployeeNoOnDB(db, employeeNo).then(function (exist) {
            if (exist && exist.id !== id) throw new Error('该工号已存在');
            old.employeeNo = employeeNo;
            old.name = name;
            old.nickname = name;                // 同步展示名
            old.departmentId = departmentId;
            old.positionId = positionId;
            old.updatedBy = op;
            old.updatedAt = Date.now();
            return reqToPromise(tx(db, 'readwrite').put(old)).then(function () {
              safeClose();
              return old;
            }, onTxError);
          }, onTxError);
        }, onTxError);
      } catch (syncErr) {
        safeClose();
        throw syncErr;
      }
    });
  }

  // ===================== 个人信息：编辑（账号 / 昵称 / 密码 / 手机 / 邮箱 / 标签 / 个性签名 / 头像）=====================
  function updateProfile(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateProfile(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    function has(k){ return patch && Object.prototype.hasOwnProperty.call(patch, k); }
    var op = (operator == null ? '' : String(operator));
    var rawPw = '';
    var oldAccount;
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('记录不存在'); }
        oldAccount = old.account;
        // 账号唯一性（排除自身）
        var chain = Promise.resolve();
        if (has('account')) {
          var newAccount = String(patch.account).trim();
          if (newAccount !== (old.account || '')) {
            chain = getUserByAccount(newAccount).then(function (exist) {
              if (exist && exist.id !== id) throw new Error('该账号已存在');
            });
          }
        }
        return chain.then(function () {
          var pwStep = Promise.resolve(old.password);
          if (has('password')) {
            rawPw = String(patch.password);
            if (rawPw) pwStep = sha256(rawPw);
          }
          return pwStep.then(function (pw) {
            var changedAccount = false;
            if (has('account')) {
              var a = String(patch.account).trim();
              changedAccount = a !== (old.account || '');
              old.account = a;
            }
            if (has('nickname')) old.nickname = String(patch.nickname).trim();
            if (has('phone')) old.phone = (patch.phone == null ? '' : String(patch.phone)).trim();
            if (has('email')) old.email = String(patch.email).trim();
            if (has('tags')) old.tags = (patch.tags == null ? '' : String(patch.tags)).trim();
            if (has('signature')) old.signature = (patch.signature == null ? '' : String(patch.signature)).trim();
            if (has('avatar')) old.avatar = (patch.avatar == null ? '' : String(patch.avatar)).trim();
            if (has('password')) old.password = pw;
            old.updatedBy = op;
            old.updatedAt = Date.now();
            return reqToPromise(tx(db, 'readwrite').put(old)).then(function () {
              db.close();
              if (changedAccount && typeof root.updateSessionAccount === 'function') {
                try { root.updateSessionAccount(old.account); } catch (e) {}
              }
              return old;
            });
          });
        }).catch(function (err) { db.close(); throw err; });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // ===================== 删除（人员管理）=====================
  function deleteUser(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('记录不存在'); }
        return reqToPromise(tx(db, 'readwrite').delete(id)).then(function () {
          db.close();
          return true;
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // ===================== 查询 =====================
  function getUser(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }
  // 按索引查询单条；索引不存在时回退全表扫描（兼容旧 DB 未建出该索引的场景）
  function queryByIndexFallback(storeName, indexName, value) {
    value = (value == null ? '' : String(value)).trim();
    if (!value) return Promise.resolve(null);
    return openDB().then(function (db) {
      var os = tx(db, 'readonly');
      // 尝试用索引
      if (os.indexNames.contains(indexName)) {
        return reqToPromise(os.index(indexName).getAll(value))
          .then(function (list) { db.close(); list = Array.isArray(list) ? list : []; return list[0] || null; })
          .catch(function (err) { db.close(); throw err; });
      }
      // 索引缺失 → 全表扫描（性能略低但保证可用）
      return reqToPromise(os.getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        for (var i = 0; i < list.length; i++) {
          if (String(list[i][indexName] || '').trim() === value) return list[i];
        }
        return null;
      }).catch(function (err) { db.close(); throw err; });
    });
  }
  function getUserByAccount(account) {
    account = (account == null ? '' : String(account)).trim();
    if (!account) return Promise.resolve(null);
    return queryByIndexFallback(STORE, 'account', account);
  }
  function getUserByEmployeeNo(employeeNo) {
    employeeNo = (employeeNo == null ? '' : String(employeeNo)).trim();
    if (!employeeNo) return Promise.resolve(null);
    return queryByIndexFallback(STORE, 'employeeNo', employeeNo);
  }

  // 在已有 db 连接上查询 account
  function getUserByAccountOnDB(db, account) {
    account = (account == null ? '' : String(account)).trim();
    if (!account) return Promise.resolve(null);
    var os = tx(db, 'readonly');
    if (os.indexNames.contains('account')) {
      return reqToPromise(os.index('account').getAll(account))
        .then(function (list) { list = Array.isArray(list) ? list : []; return list[0] || null; });
    }
    return reqToPromise(os.getAll()).then(function (list) {
      list = Array.isArray(list) ? list : [];
      for (var i = 0; i < list.length; i++) {
        if (String(list[i]['account'] || '').trim() === account) return list[i];
      }
      return null;
    });
  }

  // 在已有 db 连接上查询 employeeNo（避免 updatePerson 中重复 openDB 导致 onblocked）
  function getUserByEmployeeNoOnDB(db, employeeNo) {
    employeeNo = (employeeNo == null ? '' : String(employeeNo)).trim();
    if (!employeeNo) return Promise.resolve(null);
    var os = tx(db, 'readonly');
    if (os.indexNames.contains('employeeNo')) {
      return reqToPromise(os.index('employeeNo').getAll(employeeNo))
        .then(function (list) { list = Array.isArray(list) ? list : []; return list[0] || null; });
    }
    return reqToPromise(os.getAll()).then(function (list) {
      list = Array.isArray(list) ? list : [];
      for (var i = 0; i < list.length; i++) {
        if (String(list[i]['employeeNo'] || '').trim() === employeeNo) return list[i];
      }
      return null;
    });
  }
  function getAllUsers() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) {
          var an = (a.nickname || a.account || '').toString();
          var bn = (b.nickname || b.account || '').toString();
          return an.localeCompare(bn, 'zh');
        });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 确保某账号在 users 表中存在（legacy rt_accounts → IndexedDB 首次补齐，仅旧数据迁移用）
  function ensurePerson(account, operator) {
    account = (account == null ? '' : String(account)).trim();
    return getUserByAccount(account).then(function (u) {
      if (u) return u;
      var rt = null;
      try { rt = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch (e) {}
      if (Array.isArray(rt)) rt = rt.filter(function (a) { return a.account === account; })[0] || null;
      var now = Date.now();
      var op = (operator == null ? '' : String(operator));
      var rec = {
        id: root.RT_DB.genId(),
        account: account,
        employeeNo: '',
        nickname: (rt && rt.nickname) || account,
        name: '',
        password: (rt && rt.pwdHash) || '',
        departmentId: '', positionId: '',
        phone: (rt && rt.phone) || '',
        email: (rt && rt.email) || '',
        tags: Array.isArray(rt && rt.tags) ? rt.tags.join(' ') : '',
        signature: (rt && rt.bio) || '',
        avatar: (rt && rt.avatar) || '',
        createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
      };
      return openDB().then(function (db) {
        return reqToPromise(tx(db, 'readwrite').put(rec)).then(function () { db.close(); return rec; })
          .catch(function (err) { db.close(); throw err; });
      });
    });
  }

  // ===================== 迁移：已有账号自动填入人员表 =====================
  function migrateAccounts() {
    try { if (localStorage.getItem(MIGRATED_FLAG)) return Promise.resolve(0); }
    catch (e) {}
    var accounts = [];
    try { accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch (e) {}
    if (!Array.isArray(accounts) || !accounts.length) {
      try { localStorage.setItem(MIGRATED_FLAG, '1'); } catch (e) {}
      return Promise.resolve(0);
    }
    return openDB().then(function (db) {
      var store = tx(db, 'readwrite');
      return reqToPromise(store.getAll()).then(function (existing) {
        var have = {};
        (Array.isArray(existing) ? existing : []).forEach(function (u) { if (u && u.account) have[u.account] = true; });
        var now = Date.now();
        var ops = [];
        accounts.forEach(function (a) {
          if (!a || !a.account) return;
          if (have[a.account]) return;
          var rec = {
            id: root.RT_DB.genId(),
            account: a.account,
            employeeNo: '',
            nickname: (a.nickname || a.account),
            name: '',
            password: a.pwdHash || '',
            departmentId: '',
            positionId: '',
            phone: a.phone || '',
            email: a.email || '',
            tags: '',
            signature: '',
            avatar: '',
            createdBy: a.account,
            createdAt: a.createdAt || now,
            updatedBy: a.account,
            updatedAt: a.createdAt || now
          };
          ops.push(reqToPromise(store.put(rec)));
        });
        return Promise.all(ops).then(function () {
          db.close();
          try { localStorage.setItem(MIGRATED_FLAG, '1'); } catch (e) {}
          return ops.length;
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS,
    DEFAULT_PASSWORD: DEFAULT_PASSWORD,
    RE_ACCOUNT: RE_ACCOUNT, RE_PHONE: RE_PHONE, RE_EMAIL: RE_EMAIL,
    genId: function () { return root.RT_DB.genId(); },
    validatePerson: validatePerson,
    validateProfile: validateProfile,
    createPerson: createPerson, updatePerson: updatePerson, updateProfile: updateProfile,
    getUser: getUser, getUserByAccount: getUserByAccount, getUserByEmployeeNo: getUserByEmployeeNo,
    getAllUsers: getAllUsers, deleteUser: deleteUser, ensurePerson: ensurePerson, migrateAccounts: migrateAccounts
  };
  root.RT_USERS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
