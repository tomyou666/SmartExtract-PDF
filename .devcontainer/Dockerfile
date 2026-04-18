# マルチビルド-ビルドイメージ
FROM debian:bookworm-slim as builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl git unzip gzip xz-utils

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN curl -fsSL https://moonrepo.dev/install/proto.sh | bash -s -- -y

# マルチビルド-実際に使用するイメージ
FROM debian:bookworm-slim

ARG USERNAME=vscode
ARG UID=1000
ARG GID=1000

RUN apt-get update && apt-get install -y \
    git \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid "${GID}" "${USERNAME}" \
    && useradd --uid "${UID}" --gid "${GID}" -m -s /bin/bash "${USERNAME}"

ENV HOME=/home/${USERNAME}
ENV PROTO_HOME="${HOME}/.proto"
ENV UV_LINK_MODE=copy
ENV PATH="${HOME}/.local/bin:${PROTO_HOME}/shims:${PROTO_HOME}/bin:${PATH}"

COPY --from=builder --chown=${USERNAME}:${USERNAME} /root/.local/ ${HOME}/.local/
COPY --from=builder --chown=${USERNAME}:${USERNAME} /root/.proto/ ${HOME}/.proto/

RUN echo 'source "$HOME/.local/bin/env"' >> "${HOME}/.bashrc" \
    && ln -sf "${HOME}/.proto/shims/bun" /usr/local/bin/node

USER ${USERNAME}
WORKDIR /workspace
