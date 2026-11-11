# dsh-docker

使用 Debian 基础镜像运行 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI。
GitHub Actions 构建、检查沙箱并发布到 GHCR，本机无需 Docker。当前支持 `linux/amd64`。

## Debian 宿主机准备

按 [Docker 官方 Debian 安装说明](https://docs.docker.com/engine/install/debian/)安装 Docker Engine 和 Compose 插件。
以下命令假设当前用户已经能运行 `docker`；否则使用 `sudo docker`。

```sh
docker version
docker compose version
git clone https://github.com/sethome2/dsh-docker.git
cd dsh-docker
mkdir -p workspace
sudo chown 1000:1000 workspace
docker compose pull
docker compose up -d
docker compose logs -f dsh
```

使用日志中包含启动令牌的 `http://localhost:3080/…` 链接进入界面。首次打开后，在 Settings → Models
填写 API Key，再添加和选择 `/workspace`。令牌链接及日志只应分享给预期使用者。

如果部署在远程 Debian 服务器，在本机建立转发后访问日志中的链接：

```sh
ssh -N -L 3080:127.0.0.1:3080 user@your-server
```

Compose 默认只发布宿主机回环端口。自定义域名或公网部署需要按[上游部署说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/public-deployments.md)
配置 TLS、`--public-url` 和 `--trusted-host`；Compose 的 `command` 可追加或覆盖 Web 启动参数。

## 沙箱要求

DSH 的沙箱是内置服务，默认 Compose 只有一个容器。镜像安装 bubblewrap，并保留 npm 包携带的
Landlock 原生启动器。上游自动优先探测 bubblewrap，再尝试 Landlock。

启动前调用安装版本的 `LocalSandboxProvider`，实际检查工作区写入、临时文件、越界写入拒绝、子进程继承限制及只读模式。
成功日志显示后端及 `enforcement=full` 或 `partial`；失败则退出，不自动切换到无沙箱模式。

- bubblewrap 需要宿主机允许相关 namespace 和 mount 操作；Docker 默认安全配置可能阻止它，此时由上游尝试 Landlock。
- Landlock 需要宿主机内核启用并实际允许相关系统调用。旧 ABI 可能只提供部分限制；`partial` 按上游行为允许运行，并在日志明确显示。
- Debian 镜像不决定宿主机内核能力。必须在实际部署机器验证，不能仅凭内核版本或 Web 页面可打开判断沙箱可用。
- 此沙箱主要限制文件写入，不构成网络隔离；Landlock 与 bubblewrap 的进程可见性也不同。

手动检查（无 API Key、无需模型调用）：

```sh
docker compose run --rm --no-deps --entrypoint node dsh /opt/dsh/check-sandbox.mjs
```

失败时先检查 `workspace` 是否对 UID/GID `1000:1000` 可写，再检查宿主机 Landlock、user namespace、
Docker seccomp 和 AppArmor 配置。修复后重建容器并重新验证。不要用 `danger-full-access` 掩盖失败。
默认示例不使用 privileged、额外 capabilities、关闭 seccomp 或挂载 Docker socket。

上游说明：[本地沙箱](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sandbox/sandbox-local/README.md)、
[Landlock 支持](https://github.com/deepseek-ai/deepseek-harness/blob/master/native/system/docs/support-matrix.md)。

## 数据与日常操作

`./workspace` 是项目目录；`dsh-data` 命名卷挂载至 `/home/node/.dsh`，保存设置、凭据、插件和会话。
容器以 UID/GID `1000:1000` 运行。不要将项目工作区设为 `/`，也不要把状态目录作为项目工作区。

```sh
# 更新镜像并重建容器，保留数据
docker compose pull
docker compose up -d

# 查看日志 / 停止（保留数据）
docker compose logs --tail=100 dsh
docker compose down
```

升级前备份项目目录与命名卷；上游处于开发预览期，数据格式可能变化。`docker compose down -v` 会删除命名卷。
可以在 `.env` 中设置 `DSH_IMAGE=ghcr.io/sethome2/dsh-docker:sha-…` 固定镜像版本，完整标签见 Actions 摘要。

## 构建与发布

默认分支 push、PR 和手动运行触发 `.github/workflows/image.yml`。手动运行的 `dsh_version` 默认 `latest`，
也可填明确 npm 版本。工作流先解析为具体版本，再构建、验证 Compose、版本命令、沙箱、Web 认证和重启持久化。
测试使用与默认 Compose 相同的非 root 用户及容器权限，不调用模型 API。

PR 只验证；`main` 分支验证通过后使用 `GITHUB_TOKEN` 发布已经测试的同一镜像：

- `ghcr.io/sethome2/dsh-docker:latest`
- `ghcr.io/sethome2/dsh-docker:sha-<12位提交哈希>-<运行ID>-<重试序号>`

摘要记录实际 DSH 版本和镜像 digest。不同手动版本构建具有独立标签。首次发布后，在 GitHub 包设置中将镜像可见性
设为 Public，以支持匿名拉取；仓库公开不代表新建 GHCR 包自动公开。仓库 Actions 需允许 workflow 写入 Packages。

有 Docker 时也可以本地构建（Dockerfile 默认版本为 `0.2.2-rc.1`）：

```sh
docker build --build-arg DSH_VERSION=0.2.2-rc.1 -t dsh-docker:local .
DSH_IMAGE=dsh-docker:local docker compose up -d
```

依赖更新通过重新运行 Actions 或提交变更触发，不在容器启动时升级。
