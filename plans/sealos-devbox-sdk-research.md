# Sealos Devbox SDK 深度调研报告

## 核心问题：如何优雅实现文件操作

---

## 📊 竞品文件操作技术方案对比

### 1️⃣ **E2B Code Interpreter** - RESTful API + 二进制传输

**技术栈：**

- **协议**：HTTP/HTTPS RESTful API
- **文件传输**：直接 POST/GET 二进制数据
- **编码**：原生 binary/UTF-8

**API 设计：**

```python
# E2B Python SDK
sandbox.files.write('/path/to/file', 'content')  # 写入文本
sandbox.files.write('/path/to/file', bytes)       # 写入二进制
content = sandbox.files.read('/path/to/file')     # 读取

# 批量写入
sandbox.files.make_dir('/tmp/uploads')
sandbox.files.write_multiple([
    ('/tmp/file1.txt', 'content1'),
    ('/tmp/file2.txt', 'content2')
])
```

**底层实现推测：**

- 小文件（<10MB）：直接 HTTP body 传输
- 大文件：可能使用 multipart/form-data 或 chunked transfer encoding
- 文件系统隔离在 Firecracker microVM 内

**优点：**

- API 简洁直观
- 无需容器内依赖 tar 等工具
- 适合 AI Agent 场景

**缺点：**

- 大文件传输可能有性能瓶颈
- 网络开销相对较大

---

### 2️⃣ **Daytona** - RESTful API + tar streaming

**技术栈：**

- **协议**：RESTful API over HTTPS
- **文件传输**：基于 HTTP streaming
- **容器内依赖**：tar（用于批量操作）

**API 设计：**

```python
# Daytona Python SDK
sandbox.fs.upload_file(b'content', 'path/to/file.txt')
content = sandbox.fs.download_file('path/to/file.txt')

# 批量上传
sandbox.fs.upload_files([
    {'path': '/path1', 'content': b'data1'},
    {'path': '/path2', 'content': b'data2'}
])
```

**底层实现推测：**

- 单文件：直接 HTTP body 传输
- 批量文件：可能打包成 tar 后传输
- 基于容器技术，通过 Docker API 或类似机制

**优点：**

- 支持单文件和批量操作
- API 设计合理
- 性能相对均衡

**缺点：**

- 仍需容器内支持 tar（批量操作时）
- 文件大小限制不明确

---

### 3️⃣ **CodeSandbox SDK** - WebSocket + 文件系统 API

**技术栈：**

- **协议**：WebSocket (长连接) + RESTful API
- **文件传输**：批量压缩 + streaming
- **特色**：Node.js 风格 API

**API 设计：**

```typescript
// CodeSandbox TypeScript SDK
const client = await sandbox.connect() // WebSocket 连接

// 文本文件
await client.fs.writeTextFile('./hello.txt', 'Hello, world!')
const content = await client.fs.readTextFile('./hello.txt')

// 二进制文件
await client.fs.writeFile('./binary', new Uint8Array([1, 2, 3]))
const data = await client.fs.readFile('./binary')

// 批量写入（自动压缩）
await client.fs.batchWrite({
  './file1.txt': 'content1',
  './file2.txt': 'content2'
})

// 下载整个目录为 zip
const { downloadUrl } = await client.fs.download('./')
```

**底层实现推测：**

- **WebSocket 长连接**：保持持久连接，减少握手开销
- **批量操作优化**：自动压缩成 zip/tar 后传输
- **microVM 环境**：基于 Firecracker 的文件系统

**优点：**

- **WebSocket 长连接**：低延迟，适合频繁文件操作
- **批量压缩**：大幅减少网络开销
- **API 优雅**：Node.js 风格，开发者友好
- **支持文件监听**：watch API 实时监控变更

**缺点：**

- WebSocket 需要维护连接状态
- 相对复杂的实现

---

### 4️⃣ **Bolt.new (WebContainers)** - 浏览器内存文件系统

**技术栈：**

- **协议**：无网络传输（浏览器内运行）
- **文件系统**：WebAssembly 虚拟文件系统
- **特色**：零服务器成本

**API 设计：**

```typescript
// WebContainers API
const webcontainerInstance = await WebContainer.boot()

// 挂载文件系统（内存）
await webcontainerInstance.mount({
  'package.json': {
    file: { contents: '...' }
  },
  src: {
    directory: {
      'index.js': { file: { contents: '...' } }
    }
  }
})
```

**实现原理：**

- 完全在浏览器内运行
- 文件存储在内存中（IndexedDB 持久化）
- 无需服务器端文件传输

**优点：**

- 零网络延迟
- 极致安全（浏览器沙箱）

**缺点：**

- 不适用于服务器端场景
- 文件大小受浏览器限制

---

## 🔍 Kubernetes 原生文件传输方案

### kubectl cp 的技术实现

**核心机制：tar + SPDY streaming**

```bash
# kubectl cp 的底层实现
tar cf - /local/file | kubectl exec -i pod -- tar xf - -C /remote/path
```

**实现流程：**

1. **本地端**：将文件/目录打包成 tar 流
2. **Kubernetes API Server**：通过 SPDY 协议建立双向流
3. **Pod 容器**：接收 tar 流并解压到目标路径

**关键代码（client-go）：**

```go
// 通过 exec subresource 建立流
req := clientset.CoreV1().RESTClient().Post().
    Resource("pods").
    Name(podName).
    Namespace(namespace).
    SubResource("exec").
    VersionedParams(&corev1.PodExecOptions{
        Container: containerName,
        Command:   []string{"tar", "-xf", "-", "-C", destPath},
        Stdin:     true,
        Stdout:    true,
        Stderr:    true,
        TTY:       false,
    }, scheme.ParameterCodec)

// 使用 SPDY executor 流式传输
exec, _ := remotecommand.NewSPDYExecutor(config, "POST", req.URL())
exec.Stream(remotecommand.StreamOptions{
    Stdin:  tarStream,  // tar 数据流
    Stdout: os.Stdout,
    Stderr: os.Stderr,
})
```

**优点：**

- **Kubernetes 原生支持**
- **流式传输**：支持大文件，内存开销小
- **可靠性高**：基于成熟的 SPDY 协议

**缺点：**

- **依赖 tar**：容器内必须安装 tar 工具
- **API 复杂**：直接使用 client-go 代码量大

---

## 🎯 针对 Sealos Devbox 的最佳方案

### 核心设计理念

**场景分析：**

- AI Agents 执行代码 → 需要频繁、快速的文件操作
- 支持多语言环境（Python、Node.js、Go 等）→ 不能依赖特定工具
- 基于 Kubernetes + CRD → 可充分利用 K8s API

### 推荐方案：**混合架构 - RESTful API + tar streaming**

#### 方案一：**RESTful API（推荐用于生产）**

**架构设计：**

```
┌─────────────┐      HTTPS       ┌──────────────────┐
│  SDK Client │ ────────────────> │ Devbox API Server│
│ (Python/TS) │ <──────────────── │  (Sealos Backend) │
└─────────────┘                   └──────────────────┘
                                          │
                                          │ Kubernetes API
                                          ▼
                                  ┌──────────────────┐
                                  │  Devbox Pod      │
                                  │  (Container)     │
                                  └──────────────────┘
```

**API 设计：**

```python
# Python SDK 示例
from sealos_devbox import Devbox, DevboxConfig

# 初始化
config = DevboxConfig(api_key="xxx", api_url="https://api.sealos.io")
devbox = Devbox(config)

# 创建 Devbox（已有 API）
sandbox = devbox.create(language="python", runtime="python:3.11")

# 文件操作 API
sandbox.fs.write_file('/workspace/main.py', 'print("hello")')
content = sandbox.fs.read_file('/workspace/main.py')

# 批量上传（核心优化点）
sandbox.fs.upload_files({
    '/workspace/data.csv': csv_bytes,
    '/workspace/config.json': json_str,
    '/workspace/script.py': code_str
})

# 批量下载（返回 zip）
files = sandbox.fs.download_files(['/workspace/output.txt', '/workspace/result.csv'])

# 目录操作
sandbox.fs.list_dir('/workspace')
sandbox.fs.make_dir('/workspace/logs')
sandbox.fs.delete('/workspace/temp')
```

**后端实现（Sealos API Server）：**

```go
// handlers/filesystem.go
package handlers

import (
    "archive/tar"
    "bytes"
    "context"
    "io"
    "net/http"

    corev1 "k8s.io/api/core/v1"
    "k8s.io/client-go/kubernetes/scheme"
    "k8s.io/client-go/tools/remotecommand"
)

// FileUploadHandler 处理单文件上传
func (h *DevboxHandler) FileUploadHandler(w http.ResponseWriter, r *http.Request) {
    devboxID := r.URL.Query().Get("devbox_id")
    targetPath := r.URL.Query().Get("path")

    // 1. 验证权限
    if !h.validateDevboxOwnership(r, devboxID) {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // 2. 读取文件内容
    content, err := io.ReadAll(r.Body)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    // 3. 通过 kubectl exec 写入文件
    err = h.writeFileToDevbox(devboxID, targetPath, content)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusOK)
}

// writeFileToDevbox 通过 kubectl exec 写入文件
func (h *DevboxHandler) writeFileToDevbox(devboxID, targetPath string, content []byte) error {
    pod := h.getDevboxPod(devboxID)

    // 方法1：使用 base64 编码（无需 tar）
    cmd := []string{
        "sh", "-c",
        fmt.Sprintf("echo '%s' | base64 -d > %s",
            base64.StdEncoding.EncodeToString(content),
            targetPath),
    }

    return h.execInPod(pod.Name, pod.Namespace, cmd)
}

// BatchUploadHandler 批量上传（使用 tar）
func (h *DevboxHandler) BatchUploadHandler(w http.ResponseWriter, r *http.Request) {
    devboxID := r.URL.Query().Get("devbox_id")

    // 1. 解析 multipart form（包含多个文件）
    r.ParseMultipartForm(100 << 20) // 100MB max

    // 2. 创建 tar archive
    var buf bytes.Buffer
    tw := tar.NewWriter(&buf)

    for path, content := range filesMap {
        hdr := &tar.Header{
            Name: path,
            Mode: 0644,
            Size: int64(len(content)),
        }
        tw.WriteHeader(hdr)
        tw.Write(content)
    }
    tw.Close()

    // 3. 通过 kubectl exec 传输 tar
    err := h.uploadTarToDevbox(devboxID, &buf)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusOK)
}

// uploadTarToDevbox 上传 tar 包
func (h *DevboxHandler) uploadTarToDevbox(devboxID string, tarData io.Reader) error {
    pod := h.getDevboxPod(devboxID)

    // 构建 exec 请求
    req := h.clientset.CoreV1().RESTClient().Post().
        Resource("pods").
        Name(pod.Name).
        Namespace(pod.Namespace).
        SubResource("exec").
        VersionedParams(&corev1.PodExecOptions{
            Container: pod.Spec.Containers[0].Name,
            Command:   []string{"tar", "-xzf", "-", "-C", "/workspace"},
            Stdin:     true,
            Stdout:    true,
            Stderr:    true,
            TTY:       false,
        }, scheme.ParameterCodec)

    // 执行流式传输
    exec, err := remotecommand.NewSPDYExecutor(h.config, "POST", req.URL())
    if err != nil {
        return err
    }

    return exec.Stream(remotecommand.StreamOptions{
        Stdin:  tarData,
        Stdout: os.Stdout,
        Stderr: os.Stderr,
    })
}
```

**关键优化点：**

1. **小文件（<1MB）**：使用 base64 + shell 命令，无需 tar

   ```bash
   echo 'base64_content' | base64 -d > /path/to/file
   ```

2. **大文件/批量文件**：使用 tar + SPDY streaming

   ```bash
   tar -xzf - -C /workspace
   ```

3. **超大文件（>100MB）**：分块传输
   ```go
   // 分块上传
   chunkSize := 10 * 1024 * 1024 // 10MB
   for offset := 0; offset < len(data); offset += chunkSize {
       chunk := data[offset:min(offset+chunkSize, len(data))]
       h.uploadChunk(devboxID, filePath, offset, chunk)
   }
   ```

---

#### 方案二：**WebSocket 长连接（可选）**

**适用场景：**

- 需要**实时文件监听**（watch）
- 频繁的小文件操作
- 类似 IDE 的实时编辑场景

**架构：**

```
SDK Client <--WebSocket--> Devbox API Server <--K8s API--> Devbox Pod
```

**实现示例：**

```go
// WebSocket handler
func (h *DevboxHandler) WebSocketHandler(w http.ResponseWriter, r *http.Request) {
    conn, _ := upgrader.Upgrade(w, r, nil)
    defer conn.Close()

    for {
        // 接收消息
        var msg FileOperation
        conn.ReadJSON(&msg)

        switch msg.Type {
        case "write":
            h.writeFileToDevbox(msg.DevboxID, msg.Path, msg.Content)
            conn.WriteJSON(Response{Status: "ok"})
        case "read":
            content := h.readFileFromDevbox(msg.DevboxID, msg.Path)
            conn.WriteJSON(Response{Status: "ok", Data: content})
        case "watch":
            // 启动文件监听
            go h.watchFileChanges(msg.DevboxID, msg.Path, conn)
        }
    }
}
```

---

## 🚀 实施路线图

### Phase 1: MVP - 基础文件操作（2 周）

**目标：**

- 实现单文件上传/下载
- 支持基础目录操作

**实现：**

```python
# SDK API
sandbox.fs.write_file(path, content)
sandbox.fs.read_file(path)
sandbox.fs.list_dir(path)
sandbox.fs.make_dir(path)
sandbox.fs.delete(path)
```

**后端：**

- RESTful API + base64 编码
- 无需 tar 依赖

---

### Phase 2: 性能优化 - 批量操作（2 周）

**目标：**

- 批量上传/下载
- tar streaming 优化

**实现：**

```python
# 批量上传
sandbox.fs.upload_files({
    '/path1': content1,
    '/path2': content2
})

# 批量下载（返回 zip）
files = sandbox.fs.download_files(['/path1', '/path2'])
```

**后端：**

- tar/zip 压缩传输
- chunked transfer encoding

---

### Phase 3: 高级特性（可选，2 周）

**目标：**

- WebSocket 长连接
- 文件监听（watch）
- 大文件分块上传

**实现：**

```python
# 文件监听
@sandbox.fs.watch('/workspace')
def on_file_change(event):
    print(f"File {event.path} {event.type}")

# 大文件上传（带进度）
sandbox.fs.upload_large_file(
    local_path='./dataset.csv',
    remote_path='/workspace/data.csv',
    on_progress=lambda p: print(f"Progress: {p}%")
)
```

---

## 📝 技术决策总结

### 为什么不用 SSH？

❌ **SSH 的问题：**

1. 需要在容器内运行 sshd 进程（资源开销）
2. 需要管理 SSH 密钥（安全复杂度）
3. 端口管理复杂（需要 Service/NodePort）
4. 不符合 Kubernetes 云原生理念

### 为什么不直接用 kubectl exec？

❌ **直接暴露 kubectl exec 的问题：**

1. 安全风险：用户可以执行任意命令
2. 权限管理困难
3. SDK 难以封装成友好的 API
4. 缺乏审计和监控

✅ **通过 API Server 封装的优势：**

1. **权限控制**：API Server 可以验证用户身份和权限
2. **审计日志**：所有文件操作可追踪
3. **友好 API**：SDK 提供类似 Node.js fs 的简洁 API
4. **性能优化**：可以在 API Server 层做缓存、压缩等优化

---

## 🎯 最终推荐方案

**Sealos Devbox 应该采用：RESTful API + tar streaming 混合方案**

**理由：**

1. ✅ **简单可靠**：基于 HTTP/HTTPS，易于调试和监控
2. ✅ **Kubernetes 原生**：充分利用 K8s exec subresource
3. ✅ **性能优秀**：tar streaming 适合批量操作，base64 适合小文件
4. ✅ **安全可控**：通过 API Server 统一鉴权和审计
5. ✅ **易于扩展**：后续可以无缝添加 WebSocket 等高级特性

**核心差异化能力：**

- 基于 overlayfs + LVM 的快速 commit
- 自动文件变更追踪
- 结合 CRD 的生命周期管理

---

## 📚 参考资料

1. **Kubernetes Client-Go**: https://github.com/kubernetes/client-go
2. **kubectl cp 源码**: https://github.com/kubernetes/kubectl/blob/master/pkg/cmd/cp/cp.go
3. **E2B SDK**: https://github.com/e2b-dev/E2B
4. **Daytona SDK**: https://github.com/daytonaio/daytona
5. **CodeSandbox SDK**: https://codesandbox.io/docs/sdk

---

## 💡 额外建议

1. **镜像要求**：

   - 在 Devbox 基础镜像中预装 `tar`、`gzip` 等工具
   - 考虑使用 `busybox` 等轻量级工具集

2. **性能监控**：

   - 记录文件传输耗时
   - 监控网络带宽使用
   - 追踪大文件传输的分块情况

3. **安全加固**：

   - 文件路径校验（防止 path traversal）
   - 文件大小限制
   - 传输加密（HTTPS/TLS）
   - Rate limiting（防止滥用）

4. **错误处理**：
   - 传输中断自动重试
   - 文件完整性校验（MD5/SHA256）
   - 详细的错误信息返回
