# 需求任务追踪 PWA（req-tracker-pwa）

移动端需求 / 任务跟踪 PWA，支持离线使用、本地持久化，并可连接腾讯云开发 CloudBase 进行云端同步。

## 线上地址

- https://pwa-20260724-d2g883p981e75c948-1301944898.tcloudbaseapp.com

> 未绑定自定义域名：CloudBase 自定义域名需升级服务套餐，当前使用默认域名即可。

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

## 自定义域名

未绑定：CloudBase 自定义域名需升级服务套餐，当前使用默认域名访问（见上「线上地址」）。
