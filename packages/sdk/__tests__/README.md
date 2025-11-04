# Devbox SDK 测试文档

本目录包含 Devbox SDK 的完整测试套件，包括单元测试、集成测试、E2E 测试和性能基准测试。

## 目录结构

```
__tests__/
├── setup.ts                    # 测试环境配置和辅助工具
├── unit/                       # 单元测试
│   ├── devbox-sdk.test.ts     # DevboxSDK 核心功能测试
│   ├── devbox-instance.test.ts # DevboxInstance 测试
│   ├── connection-pool.test.ts # 连接池测试
│   └── benchmarks.test.ts     # 基准测试
├── integration/                # 集成测试
│   ├── workflow.test.ts       # 完整工作流测试
│   ├── concurrency.test.ts    # 并发操作测试
│   └── api-client.test.ts     # API 客户端测试
├── e2e/                        # 端到端测试
│   ├── app-deployment.test.ts  # 应用部署场景测试
│   └── file-operations.test.ts # 文件操作端到端测试
└── benchmarks/                 # 性能基准测试
    └── performance.bench.ts    # 性能基准测试
```

## 测试类型

### 1. 单元测试 (Unit Tests)

测试单个函数、类或模块的独立功能。

**特点**:
- 快速执行
- 隔离测试
- 不依赖外部服务
- 使用 mock 和 stub

**运行方式**:
```bash
# 运行所有单元测试
npm test -- packages/sdk/__tests__/unit/

# 运行特定测试文件
npm test -- packages/sdk/__tests__/unit/devbox-sdk.test.ts

# 监视模式
npm test -- --watch packages/sdk/__tests__/unit/
```

**示例**:
```typescript
describe('DevboxSDK', () => {
  it('应该成功初始化 SDK', () => {
    const sdk = new DevboxSDK(config)
    expect(sdk).toBeDefined()
  })
})
```

### 2. 集成测试 (Integration Tests)

测试多个模块或组件之间的协作。

**特点**:
- 测试组件间交互
- 可能使用 mock 服务
- 验证数据流
- 运行时间中等

**运行方式**:
```bash
# 运行所有集成测试
npm test -- packages/sdk/__tests__/integration/

# 需要真实环境
TEST_KUBECONFIG=/path/to/kubeconfig npm test -- packages/sdk/__tests__/integration/
```

**示例**:
```typescript
describe('完整工作流', () => {
  it('应该完成应用部署流程', async () => {
    const devbox = await sdk.createDevbox(config)
    await devbox.uploadFiles(files)
    await devbox.executeCommand('npm start')
    // 验证...
  })
})
```

### 3. E2E 测试 (End-to-End Tests)

从用户视角测试完整业务流程。

**特点**:
- 测试完整场景
- 使用真实环境
- 运行时间长
- 高价值测试

**运行方式**:
```bash
# 运行所有 E2E 测试 (需要真实环境)
TEST_KUBECONFIG=/path/to/kubeconfig npm test -- packages/sdk/__tests__/e2e/

# 运行特定场景
npm test -- packages/sdk/__tests__/e2e/app-deployment.test.ts
```

**示例**:
```typescript
describe('E2E: 应用部署', () => {
  it('应该部署 Node.js 应用', async () => {
    // 创建 Devbox
    // 上传代码
    // 安装依赖
    // 启动应用
    // 验证运行
  })
})
```

### 4. 性能基准测试 (Benchmarks)

测量关键操作的性能指标。

**特点**:
- 性能度量
- 回归检测
- 优化验证
- 生成报告

**运行方式**:
```bash
# 运行基准测试
npm test -- packages/sdk/__tests__/benchmarks/

# 生成详细报告
npm test -- --reporter=verbose packages/sdk/__tests__/benchmarks/
```

**示例**:
```typescript
bench('文件写入 - 小文件', async () => {
  const content = generateContent(1024) // 1KB
  await devbox.writeFile('/tmp/file.txt', content)
}, { iterations: 10 })
```

## 环境配置

### 环境变量

```bash
# 测试环境配置
export TEST_KUBECONFIG="/path/to/kubeconfig"
export TEST_DEVBOX_ENDPOINT="https://devbox.example.com"
export NODE_ENV="test"
```

### 跳过需要真实环境的测试

某些测试需要真实的 Kubernetes 环境。如果没有配置 `TEST_KUBECONFIG`，这些测试会自动跳过。

```typescript
it.skipIf(skipIfNoKubeconfig())('需要真实环境的测试', async () => {
  // 测试代码...
})
```

## 测试辅助工具

### TestHelper

提供测试常用功能的辅助类。

```typescript
import { TestHelper } from '../setup'

const helper = new TestHelper()

// 创建测试 Devbox
const devbox = await helper.createTestDevbox()

// 等待 Devbox 就绪
await helper.waitForDevboxReady(devbox)

// 生成随机内容
const content = helper.generateRandomContent(1024)

// 清理资源
await helper.cleanup()
```

### 工具函数

```typescript
import { sleep, retry } from '../setup'

// 等待
await sleep(1000)

// 重试操作
await retry(
  () => devbox.executeCommand('flaky-command'),
  3, // 最多重试 3 次
  1000 // 延迟 1 秒
)
```

## 测试覆盖率

### 覆盖率目标

| 模块 | 目标覆盖率 | 当前状态 |
|------|----------|---------|
| DevboxSDK | ≥ 80% | ⏳ 待测试 |
| DevboxInstance | ≥ 85% | ⏳ 待测试 |
| DevboxAPI | ≥ 80% | ⏳ 待测试 |
| ConnectionPool | ≥ 75% | ⏳ 待测试 |
| ConnectionManager | ≥ 80% | ⏳ 待测试 |
| TransferEngine | ≥ 75% | ⏳ 待测试 |

### 查看覆盖率报告

```bash
# 生成覆盖率报告
npm test -- --coverage

# 查看 HTML 报告
open coverage/index.html
```

### 覆盖率阈值

在 `vitest.config.ts` 中配置:

```typescript
coverage: {
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 75,
    statements: 80
  }
}
```

## 最佳实践

### 1. 测试命名

使用清晰描述性的测试名称:

✅ **推荐**:
```typescript
it('应该在文件不存在时抛出错误', async () => {
  // ...
})
```

❌ **不推荐**:
```typescript
it('test1', async () => {
  // ...
})
```

### 2. 测试隔离

每个测试应该独立，不依赖其他测试:

```typescript
beforeEach(async () => {
  // 为每个测试创建新的环境
  helper = new TestHelper()
})

afterEach(async () => {
  // 清理资源
  await helper.cleanup()
})
```

### 3. 测试数据

使用有意义的测试数据:

```typescript
// 使用描述性的测试数据
const testUser = {
  name: 'test-user',
  email: 'test@example.com'
}

// 而不是
const user = { n: 'a', e: 'b' }
```

### 4. 异步测试

正确处理异步操作:

```typescript
it('应该异步创建 Devbox', async () => {
  const devbox = await sdk.createDevbox(config)
  expect(devbox).toBeDefined()
}, 60000) // 设置合理的超时时间
```

### 5. 错误测试

测试错误场景:

```typescript
it('应该处理无效输入', async () => {
  await expect(
    sdk.getDevbox('invalid-name')
  ).rejects.toThrow('not found')
})
```

### 6. 清理资源

确保测试后清理资源:

```typescript
afterAll(async () => {
  if (helper) {
    await helper.cleanup()
  }
})
```

## 调试测试

### 运行单个测试

```bash
# 使用 test.only
it.only('要调试的测试', async () => {
  // ...
})

# 或使用命令行过滤
npm test -- --grep "要调试的测试"
```

### 查看详细输出

```bash
# 详细模式
npm test -- --reporter=verbose

# 显示控制台输出
npm test -- --reporter=verbose --silent=false
```

### 使用 Node.js 调试器

```bash
# VSCode 调试配置
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
  "args": ["run", "--no-coverage"],
  "console": "integratedTerminal"
}
```

## CI/CD 集成

测试在 CI/CD 流程中自动运行:

### GitHub Actions

参见 `.github/workflows/sdk-test.yml`:

- **Lint**: 代码风格检查
- **Unit Tests**: 单元测试 (Node.js 20, 22)
- **Integration Tests**: 集成测试
- **E2E Tests**: E2E 测试 (仅 main 分支)
- **Benchmarks**: 性能基准测试 (PR)
- **Coverage**: 覆盖率报告

### 本地运行 CI 测试

```bash
# 模拟 CI 环境运行所有测试
npm run test:ci

# 或分步运行
npm run lint
npm run typecheck
npm test -- --run
npm test -- --coverage
```

## 常见问题

### Q: 测试超时怎么办?

A: 增加超时时间:
```typescript
it('耗时测试', async () => {
  // ...
}, 120000) // 2 分钟
```

### Q: 如何跳过某些测试?

A: 使用 `skip`:
```typescript
it.skip('暂时跳过的测试', async () => {
  // ...
})
```

### Q: 如何测试只在特定环境运行?

A: 使用条件跳过:
```typescript
it.skipIf(condition)('条件测试', async () => {
  // ...
})
```

### Q: 测试失败后如何清理资源?

A: 使用 `try...finally` 或 `afterEach`:
```typescript
afterEach(async () => {
  await helper.cleanup() // 无论测试成功或失败都会执行
})
```

## 贡献指南

添加新测试时:

1. 选择合适的测试类型 (单元/集成/E2E)
2. 放在正确的目录
3. 使用 TestHelper 辅助工具
4. 确保清理资源
5. 添加适当的超时
6. 运行所有测试确保不破坏现有功能

## 相关文档

- [性能优化指南](../PERFORMANCE.md)
- [API 文档](../README.md)
- [贡献指南](../../../CONTRIBUTING.md)

---

最后更新: 2025-11-03

