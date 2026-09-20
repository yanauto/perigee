# Perigee Workbench

新前端壳。窗口默认不显示、不抢焦点。要看见窗口才设 `WORKBENCH_SHOW=1`。

## 构建

在 `perigee-mac` 目录：

```
pnpm install
pnpm --filter @perigee/workbench run build
pnpm --filter @perigee/workbench run typecheck
```

## 启动（隐藏）

在 `perigee-mac` 目录：

```
pnpm workbench up
```

看见窗口（调试）：

```
WORKBENCH_SHOW=1 pnpm workbench up
```

## CLI

```
pnpm workbench status
pnpm workbench pages
pnpm workbench goto chat
pnpm workbench goto settings-models
pnpm workbench send "你好"
pnpm workbench goto welcome
pnpm workbench goto sign-in
pnpm workbench enter you@local.test
pnpm workbench enter you@local.test 000000
pnpm workbench goto onboarding-download
pnpm workbench goto dashboard-overview
pnpm workbench goto settings-general
pnpm workbench goto settings-usage
pnpm workbench goto settings-spending
pnpm workbench goto settings-billing
pnpm workbench goto dashboard-overview empty
pnpm workbench goto settings-usage empty
pnpm workbench goto settings-billing empty
pnpm workbench goto settings-plan
pnpm workbench goto settings-deactivate
pnpm workbench goto settings-cloud-agents
pnpm workbench goto settings-cloud-agents empty
pnpm workbench goto settings-cloud-agents env
pnpm workbench goto settings-cloud-agents key
pnpm workbench goto settings-cloud-agents secret
pnpm workbench goto agents-setup
pnpm workbench goto agents-setup save
pnpm workbench goto agents-setup done
pnpm workbench goto agents-setup-done
pnpm workbench goto agent-task
pnpm workbench goto review-diff
pnpm workbench goto agent-desktop
pnpm workbench goto agent-desktop full
pnpm workbench goto agent-secrets
pnpm workbench goto agent-terminal
pnpm workbench goto automations
pnpm workbench goto automations empty
pnpm workbench goto automations preview
pnpm workbench goto automations-gallery
pnpm workbench goto automations-detail
pnpm workbench goto automations-detail new
pnpm workbench goto automations-detail active
pnpm workbench goto automations-detail copy
pnpm workbench goto automations-detail trigger
pnpm workbench goto automations-detail people
pnpm workbench goto automations-detail test
pnpm workbench goto automations-detail review
pnpm workbench goto settings-bugbot
pnpm workbench goto settings-bugbot empty
pnpm workbench goto settings-bugbot ready
pnpm workbench goto settings-bugbot pro
pnpm workbench goto settings-bugbot repos
pnpm workbench goto settings-bugbot-rules
pnpm workbench goto settings-bugbot-rules empty
pnpm workbench goto settings-bugbot-rules add
pnpm workbench goto settings-bugbot-rules form
pnpm workbench goto settings-bugbot-rules save
pnpm workbench goto settings-bugbot-rules gen
pnpm workbench goto settings-bugbot-rule-edit
pnpm workbench goto settings-members
pnpm workbench goto onboarding-team
pnpm workbench goto onboarding-team empty
pnpm workbench goto onboarding-team monthly
pnpm workbench goto onboarding-team custom
pnpm workbench goto onboarding-team continue
pnpm workbench goto settings-plan
pnpm workbench goto settings-plan start
pnpm workbench shot
pnpm workbench shot chat
pnpm workbench down
```

截图写到 `/tmp/perigee-workbench/`，不要提交进 git。

探测本机有没有 Grok、能不能用 ACP（不发对话，不打印密钥）：

```
pnpm workbench doctor
```

入口还没接上时，构建 CLI 后直接跑：

```
pnpm --filter @perigee/workbench exec tsc -p tsconfig.cli.json
node apps/workbench/out/cli/doctor.js
```

第一波路由：`agents-home`、`chat`、`settings-models`。
第二波进门：`welcome`、`sign-in`、`sign-up`、`verify-email`、`onboarding-download`。验证码通过后先到下载页，再进首页。下载是假按钮。
第三波账户：`dashboard-overview`、`settings-general`、`settings-usage`、`settings-spending`、`settings-billing`。`goto <id> empty` 看 Free / 空态。改套餐、删账号是弹窗，不要真支付。
第四波云端：`settings-cloud-agents`、`agents-setup`、`agent-task`、`review-diff`、`agent-desktop`。右栏 Tab 挂在任务页上（Secrets / Git / Terminal）。假数据和假 setup 进度。
第五波自动化：`automations`、`automations-gallery`、`automations-detail`。从侧栏「自动化」进列表。模板预览 / 触发器 / 保存前检查是弹层。假保存，不必真跑。
第六波 Bugbot：`settings-bugbot`、`settings-bugbot-rules`、`settings-bugbot-rule-edit`。从账户侧栏「Bugbot」进总览。`empty` 是未开仓库，`ready` 是已开但没 Review，`pro` 有一条 Review / 一条规则。加规则是弹窗，不必真审 PR。
第八波团队与套餐：`settings-members`、`onboarding-team`、`settings-plan`。从账户侧栏「Members」进升级墙，Create team 填队名和席位，Continue 打开四档套餐弹窗。`settings-plan` 是弹窗；`settings-plan start` 是独立劝升级。假升级，不接支付。本包没有桌面 IDE 页。
本机假账号，验证码任意 6 位数字。窗口默认隐藏；只有人要看见窗口时才设 `WORKBENCH_SHOW=1`。
