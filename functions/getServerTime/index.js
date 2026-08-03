// 云函数 getServerTime —— 批次 227 #5 打卡权威时间源
//
// 作用：返回服务端当前时间戳（毫秒），供前端「优先取服务端时间、回退本地时间」的
// 打卡时间源（time-source.js）调用，规避客户端时钟被改错导致的考勤失真。
//
// 部署步骤（CloudBase 控制台 / CLI）：
//   1. 在 CloudBase 控制台「云函数」新建函数，函数名固定为 getServerTime，运行环境选 Node.js。
//   2. 将本目录（functions/getServerTime/）作为函数代码上传，入口为 index.js。
//   3. 无需任何依赖、无需配置，部署即可生效（前端 time-source.js 已按函数名 getServerTime 调用）。
//   4. 若使用 CloudBase CLI：`tcb fn deploy getServerTime -e <环境ID>`（需先 `tcb login`）。
//
// 入参：无特定要求（time-source.js 传 {}）。
// 返回：{ time: <Date.now() 毫秒数> }，前端按 r.result.time 读取。
'use strict';

exports.main = async function (event, context) {
  // 返回服务端权威时间；如需更安全，可改用可信授时源，此处直接取云函数宿主时间即可。
  const time = Date.now();
  return {
    time: time,
    // 便于排障：附带 ISO 字符串（不参与前端计算）
    iso: new Date(time).toISOString()
  };
};
