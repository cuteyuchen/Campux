# 13 号服务器部署

Campux 应用由 `deploy/server/compose.yaml` 管理，复用服务器上现有的
`campux-postgres`、`campux-minio` 和 `campux-deploy_default` Docker 网络。

服务器 `.env` 需要额外设置容器内部数据库地址：

```ini
CAMPUX_CONTAINER_DATABASE_URL=postgresql://campux:密码@postgres:5432/campux_next
```

日常更新：

```bash
cd /home/cuteyuchen/projects/campux-deploy/repository
./deploy/server/update.sh
```

脚本只部署 `main` 对应的不可变 GHCR 镜像。它会先拉取镜像并备份 PostgreSQL，
然后切换应用容器；健康检查失败时恢复上一镜像。首次迁移失败时恢复原裸 Bun 服务。
