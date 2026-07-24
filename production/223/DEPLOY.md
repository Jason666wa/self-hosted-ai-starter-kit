# n8n 223 离线部署

与 `production/222` 同结构：整包拷到 `10.10.10.223` 后一键 `load-and-up.sh`。  
平台 SSO 对接：`electromagnify-ui/production/223`。

## 目录内容

| 路径 | 说明 |
|------|------|
| `docker-compose.yml` | postgres / n8n / task-runners / qdrant |
| `docker-compose.emagy-sso.override.yml` | Electromagnify SSO hooks 挂载 |
| `n8n/emagy-sso-hooks.js` | SSO 补丁 |
| `n8n/runners/` | 含 numpy/pandas 等的自定义 runners 镜像构建上下文 |
| `n8n/n8n-task-runners.json` | runners 白名单（EXTERNAL_ALLOW=*） |
| `.env` | 223 可部署密钥（gitignore） |
| `.env.example` | 模板 |
| `*.tar` | 离线镜像（本机构建导出） |
| `load-and-up.sh` | 服务器一键 load + up |
| `build-and-export-local.ps1` | 本机导出镜像 tar |

## 本机准备（有网）

```powershell
cd D:\Jason_Code\self-hosted-ai-starter-kit\production\223
.\build-and-export-local.ps1
```

若已在 `production/222` 导出过相同 `*.tar`，可直接复制到本目录，无需再导出。

确认 `.env` 已填好，且 `N8N_SSO_JWT_SECRET` 与  
`D:\Jason_Code\electromagnify-ui\production\223\.env` 完全一致。

## 上传与启动（223）

```bash
# 示例路径，按实际调整
rsync -av ./ ai@10.10.10.223:~/project/n8n/223/

ssh ai@10.10.10.223
cd ~/project/n8n/223
# 若从 Windows 拷贝导致 CRLF：
sed -i 's/\r$//' load-and-up.sh
bash load-and-up.sh
```

**更新注意：** 不要用本地还带空密钥 / `CHANGE_ME` 的 `.env` 盖掉服务器上已填好的密钥。

## 验收

```bash
curl -I http://10.10.10.223:5678
curl -s -o - -w '\nHTTP_CODE=%{http_code}\n' http://10.10.10.223:5678/emagy-sso/consume
```

期望：Editor 可打开；SSO 探针返回 400/401/403 明文（缺 ticket），不是前端 HTML 404。

浏览器：<http://10.10.10.223:5678> 完成首次 Owner 初始化。  
建议 Owner 邮箱与平台管理员一致（如 `admin@electromagnify.com`），便于 SSO。

## 与平台对接（223）

`electromagnify-ui/production/223/.env` 应对齐：

- `N8N_WEB_URL=http://10.10.10.223:5678`
- `VITE_N8N_WEB_URL=http://10.10.10.223:5678`
- `N8N_SSO_*`（与本目录 `.env` 同值）

`electromagnify-ui/production/223/docker-compose.yml` 需透传 backend 的 `N8N_*`。  
`VITE_N8N_WEB_URL` 为构建期变量，需重建 UI 镜像后才进前端包。

## 端口

| 服务 | 默认宿主机端口 |
|------|----------------|
| n8n Editor | 5678 |
| qdrant | 6333 |

可用 `.env` 中 `N8N_PORT`（宿主机映射）/ `QDRANT_PORT` 调整。

## Public Chat / Webhook 仍是 localhost？

```env
N8N_HOST=10.10.10.223
N8N_PROTOCOL=http
WEBHOOK_URL=http://10.10.10.223:5678/
```

```bash
docker compose -f docker-compose.yml -f docker-compose.emagy-sso.override.yml up -d --force-recreate n8n
```
