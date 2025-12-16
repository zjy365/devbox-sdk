# Changesets 快速上手教程

## 📚 什么是 Changesets？

**Changesets** 是一个用于管理 npm 包版本和发布流程的工具，特别适合 monorepo 项目。它帮助你：

- ✅ **自动化版本管理** - 根据变更类型（major/minor/patch）自动升级版本号
- ✅ **生成 Changelog** - 自动生成发布说明和变更日志
- ✅ **批量发布** - 在 monorepo 中管理多个包的版本和发布
- ✅ **避免错误** - 防止忘记更新版本号或发布说明

## 🎯 核心概念

### 1. Changeset 文件

一个 changeset 文件描述了你的变更：

```markdown
---
"package-name": minor
---

描述这个变更的内容，会出现在 changelog 中
```

**版本类型：**
- `major` - 重大变更，不向后兼容（1.0.0 → 2.0.0）
- `minor` - 新功能，向后兼容（1.0.0 → 1.1.0）
- `patch` -  bug 修复，向后兼容（1.0.0 → 1.0.1）

### 2. 工作流程

```
开发者创建 changeset → 提交到仓库 → 
GitHub Action 创建 Release PR → 合并 PR → 
自动发布到 npm
```

## 🚀 快速开始

### 步骤 1: 创建 Changeset

当你完成了一些代码变更，准备发布新版本时：

```bash
# 交互式创建 changeset
pnpm changeset

# 或者手动创建文件
```

**交互式流程：**
1. 选择要发布的包（monorepo 中可能有多个包）
2. 选择版本类型（major/minor/patch）
3. 输入变更描述

### 步骤 2: 查看 Changeset 文件

创建后会在 `.changeset/` 目录下生成一个文件，例如：

```markdown
---
"devbox-sdk": minor
"devbox-shared": minor
---

添加了新的文件操作 API

- 新增批量上传功能
- 支持文件监听
- 优化了错误处理
```

### 步骤 3: 提交 Changeset

```bash
git add .changeset/
git commit -m "chore: add changeset for new features"
git push
```

### 步骤 4: 自动创建 Release PR

当你推送代码到 `main` 分支后：

1. **GitHub Action 自动运行**
   - 检测到新的 changeset 文件
   - 运行 `changeset version` 更新版本号
   - 生成 changelog
   - 创建 Release PR

2. **Review Release PR**
   - 检查版本号是否正确
   - 检查 changelog 内容
   - 确认要发布的包

3. **合并 Release PR**
   - 合并后自动触发发布流程
   - 运行 `changeset publish` 发布到 npm

## 📝 实际示例

### 示例 1: 添加新功能（Minor 版本）

```bash
# 1. 创建 changeset
pnpm changeset
# 选择: devbox-sdk
# 选择: minor
# 输入: "添加文件监听功能"

# 2. 提交
git add .changeset/
git commit -m "feat: add file watching"
git push

# 3. 等待 GitHub Action 创建 Release PR
# 4. 合并 Release PR → 自动发布到 npm
```

### 示例 2: Bug 修复（Patch 版本）

```bash
# 1. 创建 changeset
pnpm changeset
# 选择: devbox-sdk
# 选择: patch
# 输入: "修复文件上传超时问题"

# 2. 提交并推送
git add .changeset/
git commit -m "fix: file upload timeout"
git push
```

### 示例 3: 重大变更（Major 版本）

```bash
# 1. 创建 changeset
pnpm changeset
# 选择: devbox-sdk
# 选择: major
# 输入: "重构 API，移除废弃方法"

# 2. 提交并推送
git add .changeset/
git commit -m "refactor: breaking API changes"
git push
```

## 🔧 项目配置

### 配置文件：`.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "zjy365/devbox-sdk" }],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["devbox-docs"]
}
```

**配置说明：**
- `changelog`: 使用 GitHub 生成 changelog
- `access`: npm 包访问权限（public/restricted）
- `baseBranch`: 基础分支名称
- `ignore`: 忽略的包（不发布）

### GitHub Workflow

`.github/workflows/release.yml` 配置了自动发布流程：

```yaml
- name: Create Release Pull Request or Publish to npm
  uses: changesets/action@v1
  with:
    publish: pnpm run release      # 发布命令
    version: pnpm run version      # 版本更新命令
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}  # 需要配置！
```

## 📦 在 Monorepo 中使用

### 多包发布

如果你的 monorepo 有多个包：

```markdown
---
"devbox-sdk": minor
"devbox-shared": patch
---

同时更新两个包
```

### 内部依赖

当 `devbox-sdk` 依赖 `devbox-shared` 时：
- 如果 `devbox-shared` 有变更，`devbox-sdk` 会自动更新依赖版本
- 配置 `updateInternalDependencies: "patch"` 控制更新策略

## 🎨 最佳实践

### 1. 及时创建 Changeset

完成功能后立即创建 changeset，不要等到发布前：

```bash
# ✅ 好的做法
git add src/
git commit -m "feat: add new API"
pnpm changeset  # 立即创建
git add .changeset/
git commit -m "chore: add changeset"
git push

# ❌ 不好的做法
# 等到要发布时才创建所有 changeset
```

### 2. 清晰的变更描述

```markdown
# ✅ 好的描述
添加了文件监听功能，支持实时监控文件变化

# ❌ 不好的描述
更新
```

### 3. 版本类型选择

- **Major**: API 破坏性变更、移除功能
- **Minor**: 新功能、新 API、向后兼容的增强
- **Patch**: Bug 修复、文档更新、性能优化

### 4. 批量变更

如果多个包需要同时发布：

```markdown
---
"devbox-sdk": minor
"devbox-shared": minor
---

统一升级到 1.1.0 版本
```

## 🧪 发布测试版本（Beta/RC）

如果你想在正式发布前测试包，可以使用 npm 的 `dist-tag` 功能：

### 方法 1: 手动发布测试版本

```bash
# 1. 更新版本号（但不发布）
pnpm changeset version

# 2. 构建项目
pnpm build

# 3. 发布到 beta tag
cd packages/sdk
npm publish --tag beta

# 4. 安装测试版本
npm install devbox-sdk@beta
```

### 方法 2: 使用预发布版本号

在 changeset 文件中，你可以指定预发布版本：

```markdown
---
"devbox-sdk": prerelease
---

测试版本，用于验证新功能
```

### 方法 3: 修改 package.json 版本

```bash
# 手动修改版本为 beta
# packages/sdk/package.json
{
  "version": "1.1.0-beta.1"
}

# 发布
npm publish --tag beta
```

### 安装测试版本

```bash
# 安装 beta 版本
npm install devbox-sdk@beta

# 或指定具体版本
npm install devbox-sdk@1.1.0-beta.1
```

## 🐛 常见问题

### Q: Release PR 没有自动创建？

**A:** 检查：
1. GitHub Action 是否运行
2. `.changeset/` 目录下是否有 changeset 文件
3. 是否推送到 `main` 分支

### Q: 发布失败？

**A:** 检查：
1. `NPM_TOKEN` secret 是否配置
2. npm 账号是否有发布权限
3. 包名是否已存在且你有权限

### Q: 想撤销 changeset？

**A:** 删除对应的 changeset 文件：

```bash
rm .changeset/your-changeset.md
git add .changeset/
git commit -m "chore: remove changeset"
git push
```

### Q: 想修改已创建的 changeset？

**A:** 直接编辑 changeset 文件：

```bash
# 编辑文件
vim .changeset/your-changeset.md

# 提交修改
git add .changeset/
git commit -m "chore: update changeset"
git push
```

### Q: 如何在发布前测试包？

**A:** 有几种方式：
1. **本地测试**: 使用 `pnpm link` 在本地链接包
2. **Beta 发布**: 发布到 `beta` tag，然后安装测试
3. **CI 测试**: 在 CI 中运行测试，确保通过后再合并 Release PR

## 📚 更多资源

- [Changesets 官方文档](https://github.com/changesets/changesets)
- [Changesets GitHub Action](https://github.com/changesets/action)
- [Semantic Versioning](https://semver.org/)

## 🎯 总结

Changesets 让版本管理变得简单：

1. **创建 changeset** → 描述你的变更
2. **提交代码** → 推送到仓库
3. **自动创建 PR** → GitHub Action 处理
4. **合并 PR** → 自动发布到 npm

就是这么简单！🚀

