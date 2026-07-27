# omp web

[English](./README.md) | [日本語](./README.ja.md)

[oh-my-pi (omp) 编程智能体](https://github.com/can1357/oh-my-pi)的本地 Web UI。omp-web 读取本机的 omp 会话文件，在浏览器中提供一个工作区，支持会话浏览、实时对话、模型配置、技能管理和项目文件预览。

## 环境要求

- 已安装 [omp](https://github.com/can1357/oh-my-pi) 且在 `PATH` 中（或通过 `OMP_WEB_OMP_BIN` 指向其二进制文件）
- Node.js 22.19.0 或更高版本（`node --version`）

## 快速开始

**免安装直接运行：**

```bash
npx omp-web@latest
```

**或全局安装：**

```bash
npm install -g omp-web
omp-web
```

然后打开 [http://127.0.0.1:30177](http://127.0.0.1:30177)。服务器就绪后，CLI 会尝试自动打开浏览器。omp-web 默认监听 `127.0.0.1`。

**选项：**

```bash
omp-web --port 8080              # 自定义端口
omp-web --hostname 0.0.0.0       # 在可信网络中暴露服务
omp-web -p 8080 -H 0.0.0.0       # 组合使用
omp-web --no-open                # 不自动打开浏览器

PORT=8080 omp-web                # 也支持环境变量
OMP_WEB_HOSTNAME=0.0.0.0 omp-web # 显式暴露到网络
OMP_WEB_NO_OPEN=1 omp-web        # 作为后台服务运行时很有用
```

omp-web 没有应用层身份验证，并且可以调用高权限的智能体。请勿将其暴露到互联网；仅在可信网络中使用非回环地址绑定。

## 功能特性

- **随时接续之前的工作**：按项目浏览以往的 omp 对话，不必翻找终端历史或会话文件路径。
- **放心尝试不同方向**：从更早的消息继续，或将会话分叉为一条独立路线。
- **跨分支工作**：在侧边栏切换 Git 工作树，新会话和资源管理器都会跟随你选择的检出。
- **边看项目边聊天**：左侧浏览文件，右侧预览源码、文档、图片、音频和 PDF，同时智能体继续工作。
- **清晰掌握会话状态**：上下文用量、费用、压缩上下文状态和系统提示词详情都显示在顶栏。
- **减少对终端配置的依赖**：在 Web UI 中管理模型、登录/API 密钥、模型测试、技能和插件。

## 配置

| 变量 | 含义 |
| --- | --- |
| `PORT` | 服务器端口（默认 `30177`；`-p/--port` 优先） |
| `OMP_WEB_HOSTNAME` | 绑定主机名（默认 `127.0.0.1`；`-H/--hostname` 优先） |
| `OMP_WEB_NO_OPEN` | 设为 `1`/`true` 可跳过自动打开浏览器 |
| `OMP_WEB_OMP_BIN` | `omp` 不在 `PATH` 中时，指向其二进制文件的绝对路径 |
| `PI_CODING_AGENT_DIR` | 指向其他 omp agent 目录（默认 `~/.omp/agent`） |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | 服务器端请求使用的标准代理变量 |

## 架构

omp-web 是一个由 Node 托管的 Next.js 应用，驱动你已安装的 `omp` 二进制文件——它并不内嵌智能体：

- **实时会话**：启动 `omp --mode rpc-ui`（基于 stdio 的 NDJSON），每个活动会话对应一个子进程，因此智能体版本始终与你安装的完全一致。
- **会话浏览**：直接以只读方式读取 omp 的会话文件（`~/.omp/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`）。
- **模型与认证**：通过 RPC 命令与 omp 子进程交互；模型面板编辑 omp agent 目录中的 `models.yml`。
- **技能与插件**：扫描 omp 的技能目录（`~/.omp/agent/skills`、项目内 `.omp/skills` 及兼容目录），并调用 `omp plugin` 进行插件管理。
- **文件访问**：文件浏览与预览仅限于所选项目目录以及会话中出现过的工作目录。
- **分叉与会话内分支**：分叉会创建新的 `.jsonl` 文件；“从此处编辑”则在同一会话文件内创建另一个分支。

## 开发

```bash
npm install
npm run dev
```

本地开发服务器运行在 [http://127.0.0.1:30177](http://127.0.0.1:30177)。

常用检查：

```bash
npx tsc --noEmit       # 类型检查
npm run lint           # ESLint（零警告）
node --test lib/*.test.mjs components/*.test.mjs   # 运行测试
```

本地开发时请避免运行 `next build` / `npm run build`。它会写入 `.next/`，可能干扰开发服务器；构建请留到发布阶段。

## 多语言支持

omp-web 支持英语、简体中文和日本語，覆盖整个界面的 633+ 条翻译字符串。语言从 `navigator.language` 自动检测，可通过顶栏的语言菜单在运行时切换。选择会跨会话持久化。

- 字典文件：`lib/i18n/locales/{en,zh-CN,ja}.json`
- 框架：`lib/i18n/index.tsx` — 基于 `useSyncExternalStore` 的轻量 store，支持 `{var}` 插值和复数形式（`.one`/`.other`）
- API 错误消息通过稳定的错误码（`errors.<code>`）在客户端翻译

## 质量

- **可访问性**：符合 WCAG AA 标准 — Lighthouse 可访问性评分 100/100，全键盘导航，焦点可见环，ARIA 角色
- **性能**：列表组件 memo 化、RAF 节流滚动/鼠标处理、防抖搜索、流式 JSONL 读取器、ETag 缓存会话列表
- **健壮性**：优雅关闭 omp 子进程（进程组杀死）、错误边界、原子化会话文件重写
- **测试**：166 个单元测试，覆盖会话解析、终端输入、Markdown 渲染和消息展示

## 致谢

omp-web 分叉自 [agegr/pi-web](https://github.com/agegr/pi-web)（MIT）——[badlogic/pi-mono](https://github.com/badlogic/pi-mono) pi 编程智能体的 Web UI，并针对 [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) 进行了适配。

## 许可证

MIT
