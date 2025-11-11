# API 文档与测试用例差异分析报告

## 概述

本报告对比了 OpenAPI 文档 (`openapi.yaml`) 和 SDK 测试用例 (`devbox-server.test.ts`) 以及实际 SDK 实现之间的差异。

## 已修复的问题

以下问题已在 SDK 实现中修复：

1. ✅ **API 路径前缀**：SDK 现在统一使用 `/api/v1/files/*` 路径
2. ✅ **HTTP 方法**：
   - `readFile` 现在使用 `POST` 方法
   - `listFiles` 现在使用 `GET` 方法
3. ✅ **批量上传格式**：SDK 现在使用 `multipart/form-data` 格式，包含 `targetDir` 参数
4. ✅ **读取文件响应格式**：SDK 现在正确解析 JSON 响应，从 `content` 字段提取内容

---

## 待解决的问题

### 1. 测试用例中未覆盖的 API

测试用例中**没有测试**以下 OpenAPI 文档中定义的端点：

1. **健康检查端点**：
   - `GET /health`
   - `GET /health/ready`

2. **进程管理端点**：
   - `POST /api/v1/process/exec` - 异步执行
   - `POST /api/v1/process/exec-sync` - 同步执行
   - `POST /api/v1/process/sync-stream` - 流式执行
   - `GET /api/v1/process/list` - 列出进程
   - `GET /api/v1/process/{processId}/status` - 获取状态
   - `GET /api/v1/process/{processId}/logs` - 获取日志
   - `POST /api/v1/process/{processId}/kill` - 终止进程

3. **会话管理端点**：
   - `GET /api/v1/sessions` - 列出会话
   - `POST /api/v1/sessions/create` - 创建会话
   - `GET /api/v1/sessions/{sessionId}` - 获取会话信息
   - `POST /api/v1/sessions/{sessionId}/exec` - 在会话中执行命令
   - `POST /api/v1/sessions/{sessionId}/cd` - 切换目录
   - `POST /api/v1/sessions/{sessionId}/env` - 更新环境变量
   - `POST /api/v1/sessions/{sessionId}/terminate` - 终止会话
   - `GET /api/v1/sessions/{sessionId}/logs` - 获取会话日志

4. **WebSocket 端点**：
   - `GET /ws` - WebSocket 连接（用于日志流和事件订阅）

---

### 2. 文档中未明确说明的功能

1. **文件元数据字段**：
   - 测试用例期望 `listFiles` 返回的文件对象包含 `type` 字段（`'file'` 或 `'directory'`）
   - 但 OpenAPI 文档中的 `FileInfo` schema 使用 `isDir` 布尔字段，没有 `type` 字段
   - **建议**：在 OpenAPI 文档中明确说明是否支持 `type` 字段，或更新测试用例使用 `isDir` 字段

2. **批量上传响应格式**：
   - 测试用例期望响应包含 `total`, `processed`, `errors` 字段
   - 但 OpenAPI 文档中的 `BatchUploadResponse` 只定义了 `uploadedFiles` 数组
   - **建议**：在 OpenAPI 文档中补充完整的响应格式，包括统计信息字段

---

## 建议修复方案

### 优先级 1：完善测试覆盖

1. 添加进程管理 API 的测试用例
2. 添加会话管理 API 的测试用例
3. 添加 WebSocket 连接的测试用例
4. 添加健康检查端点的测试用例

### 优先级 2：文档完善

1. 明确文件列表响应中的 `type` vs `isDir` 字段
2. 明确批量上传响应的完整格式（包括 `total`, `processed`, `errors` 字段）
3. 添加错误响应示例
4. 添加认证流程说明

---

## 当前状态总结

### ✅ 已修复的问题

所有关键的不兼容问题已经修复：
- API 路径前缀已统一为 `/api/v1/files/*`
- HTTP 方法已与 OpenAPI 文档一致
- 批量上传已使用 `multipart/form-data` 格式
- 读取文件已正确解析 JSON 响应

### ⚠️ 待完善的内容

1. **测试覆盖**：需要添加进程管理、会话管理、WebSocket 和健康检查的测试用例
2. **文档完善**：需要明确文件元数据字段和批量上传响应格式的完整定义

