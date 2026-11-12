# dsh-docker

使用 Debian 基础镜像运行的干净且官方的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI。
GitHub Actions 会自动构建并发布到 GHCR。 当然你也可以手动构建docker包保持安全性。

使用以下Docker 或者 Docker Compose 开始运行：

```sh
git clone https://github.com/sethome2/dsh-docker.git
cd dsh-docker
mkdir -p workspace
sudo chown 1000:1000 workspace # USER node
docker compose pull
docker compose up -d
docker compose logs -f dsh
```

点击打开文件：[Docker Compose](./compose.yaml)
``` yaml
services:
  dsh:
    image: ${DSH_IMAGE:-ghcr.io/sethome2/dsh-docker:latest}
    init: true
    restart: unless-stopped
    ports:
      - "127.0.0.1:3080:3080"
    volumes:
      - dsh-data:/home/node/.dsh
      - ./workspace:/home/node/Documents/deepseek-harness/default-workspace

volumes:
  dsh-data:
```

完成后，使用日志中包含启动令牌的 `http://localhost:3080/…` 链接进入界面。

`./workspace` 对应官方默认工作区 `/home/node/Documents/deepseek-harness/default-workspace`。
镜像配置了 Linux Documents 目录，首次使用时由 DSH 自动初始化默认工作区。
已有数据卷中的工作区不会自动迁移；升级后需在界面选择上述新路径。

本地构建及测试（无需 API Key）：

```sh
docker build -t dsh-docker:local .
export DSH_IMAGE=dsh-docker:local
docker compose run --rm --no-deps -v "$PWD/test:/opt/dsh/test:ro" --entrypoint sh dsh /opt/dsh/test/check-sandbox.sh
node test/smoke.mjs
```

启动入口为 `start.sh`；沙箱和 Web 测试位于 `test/`，由 CI 或上述命令执行，不在日常启动时运行。

Compose 默认只发布宿主机回环端口。自定义域名或公网部署需要按[上游部署说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/public-deployments.md)
配置 TLS、`--public-url` 和 `--trusted-host`；Compose 的 `command` 可追加或覆盖 Web 启动参数。
