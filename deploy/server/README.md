# 13 号服务器部署

Campux 应用由 `deploy/server/compose.yaml` 管理，复用服务器上现有的
`campux-postgres`、`campux-minio` 和 `campux-deploy_default` Docker 网络。

服务器 `.env` 需要额外设置容器内部数据库地址：

```ini
CAMPUX_CONTAINER_DATABASE_URL=postgresql://campux:密码@postgres:5432/campux_next
# 启用本地 PaddleOCR 服务；每个校园墙仍需在墙面设置中单独打开图片文字违禁词识别。
CAMPUX_OCR_ENABLED=true
CAMPUX_OCR_TIMEOUT_MS=10000
CAMPUX_OCR_FAILURE_MODE=allow
```

日常更新：

```bash
cd /home/cuteyuchen/projects/campux-deploy/repository
./deploy/server/update.sh
```

脚本会部署 `main` 对应的 Campux 与 PaddleOCR 两个不可变 GHCR 镜像。它会先拉取镜像并备份 PostgreSQL，
单独启动并检查 OCR 容器健康后才切换应用容器；健康检查失败时恢复上一镜像。首次迁移失败时恢复原裸 Bun 服务。
