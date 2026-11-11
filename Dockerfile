FROM node:24-bookworm-slim

ARG DSH_VERSION=0.2.2-rc.1
LABEL org.opencontainers.image.source="https://github.com/sethome2/dsh-docker" \
      org.opencontainers.image.title="dsh-docker" \
      org.opencontainers.image.version="${DSH_VERSION}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash bubblewrap git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/dsh
RUN npm init -y \
    && npm install --save-exact --omit=dev --include=optional "@deepseek-ai/dsh@${DSH_VERSION}" \
    && npm cache clean --force

ENV PATH="/opt/dsh/node_modules/.bin:${PATH}" \
    DSH_HOME=/home/node/.dsh
COPY scripts/check-sandbox.mjs scripts/start.mjs /opt/dsh/
RUN mkdir -p /workspace /home/node/.dsh \
    && chown node:node /workspace /home/node/.dsh
USER node
WORKDIR /workspace
EXPOSE 3080
ENTRYPOINT ["node", "/opt/dsh/start.mjs"]
