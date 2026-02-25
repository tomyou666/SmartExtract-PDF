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
RUN apt-get update && apt-get install -y \
    git

RUN apt-get clean -y && rm -rf /var/lib/apt/lists/*

RUN echo 'source "$HOME/.local/bin/env"' >> ~/.bashrc
RUN echo "export UV_LINK_MODE=copy" >> ~/.bashrc
RUN echo '# proto \n\
export PROTO_HOME="$HOME/.proto" \n\
export PATH="$PROTO_HOME/shims:$PROTO_HOME/bin:$PATH"' >> ~/.bashrc
COPY --from=builder /root/.local/ /root/.local/
COPY --from=builder /root/.proto/ /root/.proto/