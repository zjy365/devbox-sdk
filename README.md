# DevBox SDK

基于 Kubernetes 的轻量级开发环境管理工具。

## 特性

- 🚀 基于 K8s Pod 的隔离环境
- 📦 开箱即用的开发环境
- 📁 内置文件系统操作
- ⚡️ 快速部署和销毁
- 🔌 支持 40+ 种主流开发环境和框架
- 🎯 支持自定义运行时镜像

## 安装

```bash
npm install devbox-sdk
```

## 快速开始

```typescript
import { DevBox } from 'devbox-sdk';

// 创建实例
const devbox = await DevBox.create({
  runtime: 'node.js-18-2024-11-13-0700',
  kubeconfig: 'your-kubeconfig-string',
});

// 文件操作
await devbox.fileSystem.writeFile('/app/index.js', 'console.log("Hello!");');

// 删除实例
await devbox.delete();
```

## 支持的运行时

### 编程语言

- C (GCC 12.2.0)
- C++ (GCC 12.2.0)
- Go (1.22.5, 1.23.0)
- Java (OpenJDK 17)
- .NET (8.0)
- Node.js (18, 20, 22)
- PHP (7.4, 8.2)
- Python (3.10, 3.11, 3.12)
- Rust (1.81.0)

### Web 框架

- Angular (v18)
- Astro (4.10.0)
- Django (4.2.16)
- Express.js (4.21.0)
- Flask (3.0.3)
- Next.js (14.2.5)
- Nuxt3 (v3.13)
- React (18.2.0)
- Spring Boot (3.3.2)
- Svelte (6.4.0)
- Vue (v3.4.29)

### Go 框架

- Chi (v5.1.0)
- Echo (v4.12.0)
- Gin (v1.10.0)
- Iris (v12.2.11)

### 静态站点

- Docusaurus (3.5.2)
- Hexo (7.3.0)
- Hugo (v0.135.0)
- VitePress (1.4.0)

### 其他

- Nginx (1.22.1)
- Quarkus (3.16.1)
- Vert.x (4.5.10)

### 基础系统

- Debian SSH (12.6)
- Ubuntu (24.04)

## 开发

```bash
# 安装依赖
npm install

# 运行测试
npm test
```

## 许可证

[MIT License](LICENSE)
