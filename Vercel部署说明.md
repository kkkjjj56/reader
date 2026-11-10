# Vercel 部署与验证

状态：本地适配，尚未部署到 Vercel。先在预览环境验证，确认后再考虑正式上线。现有 GitHub 仓库为私有，生产分支为 `master`；将 Vercel 连接生产分支后，向该分支推送通常会自动触发生产部署。预览阶段请使用独立分支，并在创建项目时确认生产分支及自动发布设置，避免把未验证代码推到生产分支。

## 运行结构

`scripts/build-static.js` 只将网页必须的文件复制到 `public/`；此目录为生成产物，不提交 Git。`api/explain.js` 是 Vercel Function，原来的 `npm start` 仍提供本机服务。DeepSeek 只调用固定官方地址；不提供用户自定义接口。账号及私有书架由 Supabase Auth、数据库与 Storage 提供，Vercel 不保存书籍。原本地书架属于设备、浏览器和网址；从本机网址切换到 Vercel 网址后，原本地书架不会自动出现或迁移。保留原浏览器中的数据和原 TXT。

AI Key 在网页会话内由用户输入，只在当前页面内存中；请求路径为浏览器经 HTTPS 把密钥和选文发送到本站 Vercel Function，Function 用该密钥经 HTTPS 请求 `https://api.deepseek.com/chat/completions`，然后返回回答。Vercel 平台作为运行服务的提供方会处理请求，浏览器、本机扩展和平台的网络/调试功能也可能接触请求；不要开启记录请求头或正文的日志、抓包和第三方追踪。应用代码不写入密钥到日志、数据库或环境变量，不把密钥返回浏览器；密钥不保存在 Git。按用户自己的 DeepSeek 账户计费，取消请求不保证免收费。

## 公开配置与私密信息

可选构建变量：`SUPABASE_URL` 和 `SUPABASE_PUBLISHABLE_KEY`。两项必须同时设置，分别为项目 URL 与 `sb_publishable_` 开头的公开密钥；会被写进浏览器可下载的静态文件，不能用来存放私密信息。不设置时每位读者需在自己的浏览器填写这两项。Supabase 的安全依赖数据库和 Storage 策略，不依靠隐藏公开密钥。Vercel 不需要 DeepSeek Key、Supabase `service_role`、`sb_secret_`、数据库密码或个人密码；请勿填入变量、代码或聊天。用户自行在阅读器页面输入自己的 DeepSeek Key。

项目原先为课程测试关闭了邮箱确认：任何人可能使用未经验证的邮箱注册，不能证明账号属于邮箱所有者。应用没有密码找回或公开服务的完整防滥用能力。本项目面向课堂演示，保留这一注册方式，不增加验证码。演示时使用测试账号和自编文本，注意限制分享范围并关注 Supabase 与 Vercel 用量；若将来扩大使用范围，再根据需要调整认证和注册保护。无邮箱确认时不要声称提供可靠的邮箱归属验证。

## 本地检查

Node.js 20 或更新版本：

```powershell
npm ci
npm test
npm run test:browser
npm run build
```

构建输出 `public` 只包括白名单资源，不含样本、个人 TXT、文档、配置、服务端代码和测试。API 测试使用模拟 DeepSeek，浏览器测试使用隔离浏览器与模拟接口。运行前保留原项目数据；`.gitignore` 与 `.vercelignore` 排除环境变量、密钥文件、日志、依赖和未跟踪 TXT。已有 Git 跟踪的文件需要单独核对，忽略规则不会移除已跟踪文件。

## 预览部署步骤

1. 当前适配已提交并推送到私有仓库的 `codex/vercel-preview` 分支，尚未合并到生产分支 `master`。在此分支的项目目录打开 PowerShell。首次可执行 `npx vercel login`，按终端给出的提示在浏览器登录本人账号；不要将登录验证码、令牌或密码发送到聊天里。
2. 执行 `npx vercel deploy`，按提示选择自己的 Vercel 账号或团队，创建并关联项目，项目根目录使用当前文件夹。确认这是 Preview 部署，命令中不要添加 `--prod`。`vercel.json` 指定构建命令和 `public` 输出目录；构建阶段可能等待安装 CLI 和依赖。终端给出的预览网址可用于下一步测试。若 Vercel 项目已有同名项目，先核对归属和已有配置。
3. 默认无需配置任何环境变量。预览网页第一次使用云书架时，在网页中填写 Supabase 项目 URL 和 Publishable key（`sb_publishable_`），这两项为公开配置。若想让其他读者免填，可在 Vercel Project Settings → Environment Variables 为 Preview 添加公开的 `SUPABASE_URL` 与 `SUPABASE_PUBLISHABLE_KEY` 并重新部署。Vercel 不需要 DeepSeek Key、service_role、secret key 或数据库密码。
4. 用两个测试账号和自编 TXT 验证注册登录、书架、跨账号隔离、上传下载、删除、进度和断网重试；另一台设备用相同预览网址及测试账号复核。AI 先以模拟响应测试；真实密钥只能由持有者在阅读器页面输入，可能产生费用。预览若启用了 Vercel Authentication，另一台设备可能需要相应访问权限。
5. 本地地址和 Vercel 预览网址的本地书架彼此独立；不要自动迁移。预览和生产网址也各有独立本地书架。云书架依赖相同 Supabase 项目和账号。

## 测试完成后的上线和更新

先复核预览结果、安全限制和当前 Supabase 项目是否适合对外使用。用户明确确认上线后，再按项目设置将已验证的改动合并到生产分支，或者使用 Vercel 支持的分阶段生产发布方式；不要把预览 URL 是否可访问当成生产已上线。在 Vercel Project Settings → Git 连接 GitHub 仓库后，后续推送到生产分支通常会触发生产构建，其他分支通常生成预览部署；连接或改变生产分支前先检查是否会触发部署。查看 Vercel Deployments 中的状态与实际提交，失败时查看构建日志且不要在日志中输出密钥。不同网址的本地书架互相独立，云端书架依赖同一 Supabase 项目和账号。

## 测试记录

- 本地：运行单元测试、浏览器测试、静态白名单构建以及 Vercel Function 模拟测试，具体结果以本次执行输出为准。
- 真实 Supabase：此前在测试项目用临时账号和自编文本验证两账号隔离、上传下载、删除、进度冲突和恢复；本次尚未重新运行真实云端测试。
- Vercel 预览及生产：本次尚未部署、尚未测试。费用、地域访问、保护功能和供应商留存策略以实际套餐及设置为准。

本次 Vercel 适配复测：本地 22 项 Node 测试、28 项 Chrome/Edge 浏览器测试通过；真实 Supabase 测试项目中使用两个随机测试账号和自编文本，通过注册登录、跨账号查询/下载/删除/写进度限制、上传下载、进度读写及删除。测试文件和进度已删除，两个随机测试账号仍在 Auth。Vercel Function 使用模拟 DeepSeek 响应；Vercel 预览与生产尚未部署或验证。
