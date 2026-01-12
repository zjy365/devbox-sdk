# Docker Build Instructions

## 🚀 Quick Start (Build from monorepo root)

```bash
# IMPORTANT: Must be run from the monorepo root directory
docker build --platform linux/amd64 -f apps/docs/Dockerfile -t devbox-docs:latest .
```

## 🏃 Run the container

```bash
docker run -p 3000:3000 devbox-docs:latest
```

---

## 🔧 Advanced Usage

### Build with buildx

```bash
docker buildx build --platform linux/amd64 -f apps/docs/Dockerfile -t devbox-docs:latest .
```

### Build and push to registry

```bash
docker buildx build --platform linux/amd64 -f apps/docs/Dockerfile -t your-registry/devbox-docs:latest --push .
```

### Multi-platform build

```bash
docker buildx build --platform linux/amd64,linux/arm64 -f apps/docs/Dockerfile -t devbox-docs:latest .
```

### Build with custom tag

```bash
docker build --platform linux/amd64 -f apps/docs/Dockerfile -t devbox-docs:v1.0.0 .
```

---

## 📦 Complete Workflow

```bash
# 1. Make sure you're in the monorepo root
cd /path/to/devbox-sdk

# 2. Build the image
docker build --platform linux/amd64 -f apps/docs/Dockerfile -t devbox-docs:latest .

# 3. Run the container
docker run -d -p 3000:3000 --name devbox-docs devbox-docs:latest

# 4. Check logs
docker logs -f devbox-docs

# 5. Stop and remove
docker stop devbox-docs && docker rm devbox-docs
```

---

## 🐛 Troubleshooting

### Fix buildx permission errors

```bash
sudo chown -R $(whoami) ~/.docker/buildx
```

### Check container logs

```bash
docker logs <container-id>
```

### Interactive shell for debugging

```bash
docker run -it --entrypoint sh devbox-docs:latest
```

### Verify build output

```bash
docker run --rm devbox-docs:latest ls -la apps/docs
```

### Clean build (no cache)

```bash
docker build --no-cache --platform linux/amd64 -f apps/docs/Dockerfile -t devbox-docs:latest .
```

---

## ⚠️ Important Notes

1. **Always build from the monorepo root directory** - The Dockerfile expects workspace structure
2. **Use `--platform linux/amd64`** for production deployments on x86_64 servers
3. **Tag with version numbers** for production: `devbox-docs:v1.0.0`
4. **Test locally first** before pushing to registry

---

## 🎯 Why Build from Root?

This project uses pnpm workspaces:
- `pnpm-lock.yaml` and `pnpm-workspace.yaml` are only in the root directory
- Dependencies are hoisted to root `node_modules`
- Workspace resolution requires the full monorepo context

Building from `apps/docs` directly won't work without restructuring the project.
