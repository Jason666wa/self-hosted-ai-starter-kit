# Extend official runners so Code node can import common third-party packages.
# Keep tag in sync with n8nio/n8n (compose uses :latest).
# https://docs.n8n.io/deploy/host-n8n/configure-n8n/set-up-task-runners/#adding-extra-dependencies
FROM n8nio/runners:latest

USER root

COPY requirements.txt /tmp/requirements.txt

RUN cd /opt/runners/task-runner-python \
  && uv pip install --no-cache -r /tmp/requirements.txt \
  && rm -f /tmp/requirements.txt

USER runner
