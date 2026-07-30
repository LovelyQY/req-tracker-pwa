# 需求任务追踪 PWA（req-tracker-pwa）

移动端需求 / 任务跟踪 PWA，支持离线使用、本地持久化，并可连接腾讯云开发 CloudBase 进行云端同步。

## 线上地址

- 默认域名：https://pwa-20260724-d2g883p981e75c948-1301944898.tcloudbaseapp.com
- 自定义域名（待 DNS 解析生效）：https://pwa.lovelyqy.com

手机浏览器打开后，可通过「添加到主屏幕」安装为 App，支持离线使用。

## CloudBase 环境

- 环境 ID：`pwa-20260724-d2g883p981e75c948`
- 地域：ap-shanghai
- 连接配置：`config.js` 中的 `RT_CONFIG.sync.cloudbase.envId`
- Web SDK：v3 ESM（`@cloudbase/js-sdk@3.6.6`），在 `index.html` 引入并挂载 `window.cloudbase`
- 登录方式：控制台已开启「匿名登录」

## 部署

使用 CloudBase CLI 直接上传静态文件（纯静态站点，无需构建）：

```bash
tcb hosting deploy . -e pwa-20260724-d2g883p981e75c948
```

> 注意：部署目录不要包含 `.git`（其中含 GitHub 令牌，切勿上传到公开托管）。

## 自定义域名（pwa.lovelyqy.com）

绑定自定义域名需满足以下条件：

1. 域名 `lovelyqy.com` 已完成 ICP 备案；
2. 在腾讯云 SSL 证书控制台申请 / 上传 `pwa.lovelyqy.com` 的有效证书，取得证书 ID；
3. 在域名服务商处添加 CNAME 记录，将 `pwa.lovelyqy.com` 指向：
   `pwa-20260724-d2g883p981e75c948-1301944898.tcloudbaseapp.com`；
4. 执行绑定命令：
   ```bash
   tcb domains add pwa.lovelyqy.com --certid <证书ID> -e pwa-20260724-d2g883p981e75c948
   ```
