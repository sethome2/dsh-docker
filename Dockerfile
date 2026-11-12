FROM node:24-bookworm-slim

ARG DSH_VERSION=0.2.2-rc.1
LABEL org.opencontainers.image.source="https://github.com/sethome2/dsh-docker" \
      org.opencontainers.image.title="dsh-docker" \
      org.opencontainers.image.version="${DSH_VERSION}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash bubblewrap git ca-certificates xdg-user-dirs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/dsh
RUN npm init -y \
    && npm install --save-exact --omit=dev --include=optional "@deepseek-ai/dsh@${DSH_VERSION}" \
    && npm cache clean --force

ENV PATH="/opt/dsh/node_modules/.bin:${PATH}" \
    DSH_HOME=/home/node/.dsh
COPY start.sh /opt/dsh/start.sh
RUN mkdir -p /home/node/.config /home/node/Documents/deepseek-harness/default-workspace /home/node/.dsh \
    && printf 'XDG_DOCUMENTS_DIR="$HOME/Documents"\n' > /home/node/.config/user-dirs.dirs \
    && chown -R node:node /home/node/.config /home/node/Documents /home/node/.dsh
USER node
WORKDIR /home/node/Documents/deepseek-harness/default-workspace
EXPOSE 3080
ENTRYPOINT ["sh", "/opt/dsh/start.sh"]
