// users.js —— 人员（用户）表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块注册 'users' store，
// 作为「人员主数据」统一管理账号、部门 / 职位归属、联系方式等。
//
// 字段（含审计字段）：
//   id            string   32 位自动 ID（即「人员ID」）
//   account       账号     string  4–20 位，仅英文(大小写)/数字/. _ - @（必填，唯一）
//   employeeNo    工号     string  选填
//   nickname      昵称     string  1–10 位（必填，展示用）
//   name          姓名     string  选填
//   password      密码     string  必填；统一存 SHA-256 哈希（与注册流程一致），不存明文
//   departmentId  部门ID   string  必填，指向 departments 表
//   positionId    职位ID   string  选填，指向 positions 表
//   phone         手机     string  选填，11 位中国大陆手机号
//   email         邮箱     string  必填
//   tags          标签     string  选填
//   signature     个性签名 string  选填
//   avatar        头像     string  选填（图片 URL / dataURL）
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
//
// 迁移：migrateAccounts() 把 localStorage 中「已有账号」(rt_accounts) 一次性导入本表，
// 密码沿用原 pwdHash；老账号无部门，departmentId 留空待在人员管理页补全。迁移幂等，仅首次执行。
(function (root) {
  'use strict';

  var STORE = 'users';
  var LIMITS = {
    ACCOUNT_MIN: 4, ACCOUNT_MAX: 20,
    NICKNAME_MAX: 10, NAME_MAX: 30,
    PW_MIN: 8, PW_MAX: 20,
    EMPLOYEE_NO_MAX: 30, TAGS_MAX: 100, SIGNATURE_MAX: 100, AVATAR_MAX: 2000,
    EMAIL_MAX: 60
  };
  var MIGRATED_FLAG = 'rt_users_migrated_v1';
  var ACCOUNTS_KEY = 'rt_accounts';

  // 注册 store（db.js 首次打开时创建；跨页面懒注册场景下自动补齐缺失 store）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'account', path: 'account' },
        { name: 'email', path: 'email' },
        { name: 'departmentId', path: 'departmentId' },
        { name: 'positionId', path: 'positionId' },
        { name: 'nickname', path: 'nickname' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  // ===================== 校验常量 =====================
  var RE_ACCOUNT    = /^[A-Za-z0-9._@-]{4,20}$/;     // 账号字符集
  var RE_PW_CHARSET = /^[A-Za-z0-9@._#]{8,20}$/;     // 密码字符集（不含中文）
  var RE_PW_UPPER   = /[A-Z]/;
  var RE_PW_LOWER   = /[a-z]/;
  var RE_PW_DIG     = /[0-9]/;
  var RE_PW_SYM     = /[@._#]/;
  var RE_PHONE      = /^1[3-9]\d{9}$/;
  var RE_EMAIL      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ===================== 校验（同步，字段格式）=====================
  // opts.isEdit=true 时：密码留空表示不修改（不强制），其余必填项仍校验。
  function validateUser(data, opts) {
    var isEdit = !!(opts && opts.isEdit);
    var errors = {};
    data = data || {};
    var account      = (data.account == null ? '' : String(data.account)).trim();
    var nickname     = (data.nickname == null ? '' : String(data.nickname)).trim();
    var name         = (data.name == null ? '' : String(data.name)).trim();
    var password     = (data.password == null ? '' : String(data.password));
    var departmentId = (data.departmentId == null ? '' : String(data.departmentId));
    var employeeNo   = (data.employeeNo == null ? '' : String(data.employeeNo)).trim();
    var phone        = (data.phone == null ? '' : String(data.phone)).trim();
    var email        = (data.email == null ? '' : String(data.email)).trim();
    var tags         = (data.tags == null ? '' : String(data.tags)).trim();
    var signature    = (data.signature == null ? '' : String(data.signature)).trim();
    var avatar       = (data.avatar == null ? '' : String(data.avatar)).trim();

    if (!account) errors.account = '请输入账号';
    else if (!RE_ACCOUNT.test(account)) errors.account = '账号须 4-20 位，仅含英文、数字、. _ - @';
    else if (account.length > LIMITS.ACCOUNT_MAX) errors.account = '账号最多 ' + LIMITS.ACCOUNT_MAX + ' 位';

    if (!nickname) errors.nickname = '请输入昵称';
    else if (nickname.length > LIMITS.NICKNAME_MAX) errors.nickname = '昵称最多 ' + LIMITS.NICKNAME_MAX + ' 位';

    if (name.length > LIMITS.NAME_MAX) errors.name = '姓名最多 ' + LIMITS.NAME_MAX + ' 位';

    if (!isEdit) {
      if (!password) errors.password = '请输入密码';
      else if (!isPwOk(password)) errors.password = '密码须 8-20 位且含大小写、数字、符号(@._#)';
    } else if (password && !isPwOk(password)) {
      errors.password = '密码须 8-20 位且含大小写、数字、符号(@._#)';
    }

    if (!departmentId) errors.departmentId = '请选择部门';

    if (employeeNo.length > LIMITS.EMPLOYEE_NO_MAX) errors.employeeNo = '工号最多 ' + LIMITS.EMPLOYEE_NO_MAX + ' 位';
    if (phone && !RE_PHONE.test(phone)) errors.phone = '手机号格式不正确（11 位，1 开头）';
    if (!email) errors.email = '请输入邮箱';
    else if (!RE_EMAIL.test(email)) errors.email = '邮箱格式不正确';
    else if (email.length > LIMITS.EMAIL_MAX) errors.email = '邮箱最多 ' + LIMITS.EMAIL_MAX + ' 位';
    if (tags.length > LIMITS.TAGS_MAX) errors.tags = '标签最多 ' + LIMITS.TAGS_MAX + ' 位';
    if (signature.length > LIMITS.SIGNATURE_MAX) errors.signature = '个性签名最多 ' + LIMITS.SIGNATURE_MAX + ' 位';
    if (avatar.length > LIMITS.AVATAR_MAX) errors.avatar = '头像地址过长';

    var first = null;
    ['account', 'nickname', 'name', 'password', 'departmentId', 'employeeNo', 'phone', 'email', 'tags', 'signature', 'avatar']
      .forEach(function (k) { if (errors[k] && !first) first = k; });
    return { ok: Object.keys(errors).length === 0, errors: errors, first: first };
  }

  function isPwOk(v) {
    if (v.length < LIMITS.PW_MIN || v.length > LIMITS.PW_MAX) return false;
    if (!RE_PW_CHARSET.test(v)) return false;
    if (!RE_PW_UPPER.test(v) || !RE_PW_LOWER.test(v) || !RE_PW_DIG.test(v) || !RE_PW_SYM.test(v)) return false;
    return true;
  }

  // ===================== IndexedDB 底层（委托 db.js）=====================
  function openDB() { return root.RT_DB.openDB(); }
  function tx(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }
  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  // SHA-256 哈希（与注册流程一致），返回 64 位十六进制小写串；环境不支持时 reject。
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

  // ===================== CRUD =====================
  function createUser(data, operator) {
    var v = validateUser(data, { isEdit: false });
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var raw = (data.password == null ? '' : String(data.password));
    var op = (operator == null ? '' : String(operator));
    return getUserByAccount((data.account + '').trim()).then(function (exist) {
      if (exist) throw new Error('该账号已存在');
      return sha256(raw);
    }).then(function (hash) {
      var now = Date.now();
      return openDB().then(function (db) {
        var record = {
          id: root.RT_DB.genId(),
          account: (data.account + '').trim(),
          employeeNo: (data.employeeNo == null ? '' : String(data.employeeNo)).trim(),
          nickname: (data.nickname + '').trim(),
          name: (data.name == null ? '' : String(data.name)).trim(),
          password: hash,
          departmentId: (data.departmentId == null ? '' : String(data.departmentId)),
          positionId: (data.positionId == null ? '' : String(data.positionId)).trim(),
          phone: (data.phone == null ? '' : String(data.phone)).trim(),
          email: (data.email + '').trim(),
          tags: (data.tags == null ? '' : String(data.tags)).trim(),
          signature: (data.signature == null ? '' : String(data.signature)).trim(),
          avatar: (data.avatar == null ? '' : String(data.avatar)).trim(),
          createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
        };
        return reqToPromise(tx(db, 'readwrite').put(record)).then(function () { db.close(); return record; })
          .catch(function (err) { db.close(); throw err; });
      });
    });
  }

  function updateUser(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateUser(patch, { isEdit: true });
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    var newAccount = (patch.account + '').trim();
    var rawPw = (patch.password == null ? '' : String(patch.password));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('记录不存在'); }
        // 账号唯一性（编辑时排除自身）
        var chain = Promise.resolve();
        if (newAccount !== (old.account || '')) {
          chain = getUserByAccount(newAccount).then(function (exist) {
            if (exist && exist.id !== id) throw new Error('该账号已存在');
          });
        }
        return chain.then(function () {
          // 密码：留空则沿用旧哈希，提供则重新哈希
          var pwStep = rawPw ? sha256(rawPw) : Promise.resolve(old.password);
          return pwStep.then(function (pw) {
            old.account = newAccount;
            old.employeeNo = (patch.employeeNo == null ? old.employeeNo : String(patch.employeeNo).trim());
            old.nickname = (patch.nickname + '').trim();
            old.name = (patch.name == null ? old.name : String(patch.name).trim());
            old.password = pw;
            old.departmentId = (patch.departmentId == null ? old.departmentId : String(patch.departmentId));
            old.positionId = (patch.positionId == null ? old.positionId : String(patch.positionId).trim());
            old.phone = (patch.phone == null ? old.phone : String(patch.phone).trim());
            old.email = (patch.email + '').trim();
            old.tags = (patch.tags == null ? old.tags : String(patch.tags).trim());
            old.signature = (patch.signature == null ? old.signature : String(patch.signature).trim());
            old.avatar = (patch.avatar == null ? old.avatar : String(patch.avatar).trim());
            old.updatedBy = op;
            old.updatedAt = Date.now();
            return reqToPromise(tx(db, 'readwrite').put(old)).then(function () { db.close(); return old; });
          });
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function deleteUser(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id))
        .then(function () { db.close(); return true; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function getUser(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  // 按账号精确查找（account 索引非唯一，但账号实际唯一，返回首条或 null）
  function getUserByAccount(account) {
    account = (account == null ? '' : String(account)).trim();
    if (!account) return Promise.resolve(null);
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').index('account').getAll(account))
        .then(function (list) { db.close(); list = Array.isArray(list) ? list : []; return list[0] || null; })
        .catch(function (err) { db.close(); throw err; });
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

  // ===================== 迁移：已有账号自动填入人员表 =====================
  // 读取 localStorage 的 rt_accounts，把尚未在 users 表中的账号导入；
  // 密码沿用原 pwdHash，departmentId 留空。幂等：写入本地标记，仅首次执行。返回导入条数。
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
          if (have[a.account]) return; // 已存在则跳过
          var rec = {
            id: root.RT_DB.genId(),
            account: a.account,
            employeeNo: '',
            nickname: (a.nickname || a.account),
            name: '',
            password: a.pwdHash || '',          // 沿用原哈希；老账号无 pwdHash 时为空
            departmentId: '',                    // 老账号无部门，留空待补全
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
    RE_ACCOUNT: RE_ACCOUNT, RE_PHONE: RE_PHONE, RE_EMAIL: RE_EMAIL,
    genId: function () { return root.RT_DB.genId(); },
    validateUser: validateUser,
    createUser: createUser, updateUser: updateUser,
    deleteUser: deleteUser, getUser: getUser,
    getUserByAccount: getUserByAccount, getAllUsers: getAllUsers,
    migrateAccounts: migrateAccounts
  };
  root.RT_USERS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
