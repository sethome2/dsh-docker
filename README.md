# dsh-docker

使用 Debian 基础镜像运行的干净且官方的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI。
GitHub Actions 会自动构建并发布到 GHCR。 当然你也可以手动构建docker包保持安全性。

每天北京时间 04:00，GitHub Actions 会读取上游 npm `latest` 版本，构建镜像并运行沙箱、Web 和持久化测试。全部通过后发布到 `ghcr.io/sethome2/dsh-docker:latest`；
使用 Docker Compose 部署时，在 `compose.yaml` 所在目录执行 `docker compose pull dsh && docker compose up -d --no-deps dsh` 即可更新容器，挂载的工作区和数据卷会保留。
使用 `docker run` 部署时，先执行 `docker pull ghcr.io/sethome2/dsh-docker:latest`，再删除旧容器并按原启动参数重新创建，保留原有挂载。

使用以下Docker 或者 Docker Compose 开始运行：

```sh
# step 1: 工作区目录
mkdir -p workspace
sudo chown 1000:1000 workspace # USER node

# step 2: 二选一执行下面的代码，docker run 或者 docker compose
docker run -d \
  --name dsh \
  --init \
  --restart unless-stopped \
  -p 127.0.0.1:3080:3080 \
  -v dsh-data:/home/node/.dsh \
  -v "$PWD/workspace:/home/node/Documents/deepseek-harness/default-workspace" \
  ghcr.io/sethome2/dsh-docker:latest \
  # --public-url https://dsh.example.com/ \
  # --trusted-host 127.0.0.1 # 对外反代才需要
docker logs -f dsh

# docker compose
git clone https://github.com/sethome2/dsh-docker.git
cd dsh-docker
docker compose pull
docker compose up -d
docker compose logs -f dsh
```

点击打开参考docker compose文件：[Docker Compose](./compose.yaml)
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
    # command: # 对外反代才需要
    #   - --public-url
    #   - https://dsh.example.com/
    #   - --trusted-host
    #   - dsh.example.com
volumes:
  dsh-data:

```

完成后，使用日志中包含启动令牌的 `http://localhost:3080/…` 链接进入界面。

`./workspace` 对应官方默认工作区 `/home/node/Documents/deepseek-harness/default-workspace`。
镜像配置了 Linux Documents 目录，首次使用时由 DSH 自动初始化默认工作区。

## 本地构建及测试：

```sh
docker build -t dsh-docker:local .
export DSH_IMAGE=dsh-docker:local
docker compose run --rm --no-deps -v "$PWD/test:/opt/dsh/test:ro" --entrypoint sh dsh /opt/dsh/test/check-sandbox.sh
node test/smoke.mjs
```
# 项目目录说明
- `start.sh`： Docker 启动入口
- `test/*`： 冒烟测试和沙箱测试

# 其他注意事项
Compose 默认只发布宿主机回环端口。自定义域名或公网部署需要按[上游部署说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/public-deployments.md)
配置 TLS、`--public-url` 和 `--trusted-host`；Compose 的 `command` 可追加或覆盖 Web 启动参数。
