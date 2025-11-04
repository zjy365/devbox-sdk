/**
 * E2E: 应用部署测试
 * 测试真实的应用部署场景
 */

import { describe, it, expect } from 'vitest'
import { TestHelper, skipIfNoKubeconfig, sleep } from '../setup'

describe('E2E: 真实应用部署', () => {
  it.skipIf(skipIfNoKubeconfig())(
    '应该部署简单的 Node.js HTTP 服务',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('\n🚀 开始 Node.js 应用部署流程...\n')

        // 步骤 1: 创建 Devbox
        console.log('📦 步骤 1/6: 创建 Devbox...')
        const devbox = await helper.createTestDevbox({
          runtime: 'node',
          resource: {
            cpu: 2000, // 2 cores
            memory: 4096, // 4GB
          },
          ports: [
            { number: 3000, protocol: 'HTTP' }
          ],
        })
        console.log(`   ✓ Devbox 创建成功: ${devbox.name}`)

        // 步骤 2: 等待就绪
        console.log('\n⏳ 步骤 2/6: 等待 Devbox 就绪...')
        await helper.waitForDevboxReady(devbox)
        console.log('   ✓ Devbox 已就绪')

        // 步骤 3: 准备应用代码
        console.log('\n📝 步骤 3/6: 准备应用代码...')
        const appCode = `
import { createServer } from 'http';

const server = createServer((req, res) => {
  console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.url}\`);
  
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: Date.now() }));
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Hello from Devbox SDK!</h1><p>Deployment successful.</p>');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(\`Server running on port \${PORT}\`);
  console.log('Application ready to serve requests');
});
`

        const packageJson = {
          name: 'devbox-test-app',
          version: '1.0.0',
          type: 'module',
          main: 'server.js',
          scripts: {
            start: 'node server.js',
          },
        }

        await devbox.uploadFiles({
          '/app/package.json': JSON.stringify(packageJson, null, 2),
          '/app/server.js': appCode,
        })
        console.log('   ✓ 应用代码上传成功')

        // 步骤 4: 启动应用
        console.log('\n🚀 步骤 4/6: 启动应用...')
        await devbox.executeCommand(
          'cd /app && nohup npm start > /tmp/app.log 2>&1 &'
        )
        console.log('   ✓ 启动命令已执行')

        // 步骤 5: 等待应用启动
        console.log('\n⏳ 步骤 5/6: 等待应用启动...')
        await sleep(8000)

        // 验证进程运行
        const psResult = await devbox.executeCommand(
          'ps aux | grep "node server.js" | grep -v grep'
        )
        expect(psResult.stdout).toContain('node server.js')
        console.log('   ✓ 应用进程正在运行')

        // 检查日志
        const logResult = await devbox.executeCommand('cat /tmp/app.log')
        console.log('\n📋 应用日志:')
        console.log(logResult.stdout)
        expect(logResult.stdout).toContain('Server running on port')

        // 步骤 6: 测试应用接口
        console.log('\n🧪 步骤 6/6: 测试应用接口...')
        
        // 测试健康检查
        const healthCheck = await devbox.executeCommand(
          'curl -s http://localhost:3000/health'
        )
        expect(healthCheck.exitCode).toBe(0)
        const healthData = JSON.parse(healthCheck.stdout)
        expect(healthData.status).toBe('healthy')
        console.log('   ✓ 健康检查通过')

        // 测试主页
        const homeCheck = await devbox.executeCommand(
          'curl -s http://localhost:3000/'
        )
        expect(homeCheck.exitCode).toBe(0)
        expect(homeCheck.stdout).toContain('Hello from Devbox SDK')
        console.log('   ✓ 主页访问正常')

        console.log('\n✅ Node.js 应用部署测试完成!\n')
      } finally {
        await helper.cleanup()
      }
    },
    600000
  ) // 10 minutes

  it.skipIf(skipIfNoKubeconfig())(
    '应该部署 Python 应用',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('\n🐍 开始 Python 应用部署流程...\n')

        // 创建 Devbox
        console.log('📦 创建 Devbox...')
        const devbox = await helper.createTestDevbox({
          runtime: 'python',
          resource: {
            cpu: 1000,
            memory: 2048,
          },
        })

        await helper.waitForDevboxReady(devbox)

        // 准备 Python 代码
        console.log('📝 准备 Python 应用代码...')
        const pythonCode = `
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
from datetime import datetime

class SimpleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<h1>Python App Running!</h1>')
        elif self.path == '/api/info':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            data = {
                'app': 'python-test',
                'timestamp': datetime.now().isoformat(),
                'status': 'running'
            }
            self.wfile.write(json.dumps(data).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        print(f"[{datetime.now().isoformat()}] {format % args}")

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 8000), SimpleHandler)
    print('Python server started on port 8000')
    server.serve_forever()
`

        await devbox.writeFile('/app/server.py', pythonCode)
        console.log('   ✓ 代码上传成功')

        // 启动应用
        console.log('🚀 启动 Python 应用...')
        await devbox.executeCommand(
          'cd /app && nohup python3 server.py > /tmp/python-app.log 2>&1 &'
        )

        await sleep(5000)

        // 验证运行
        const psResult = await devbox.executeCommand(
          'ps aux | grep "python3 server.py" | grep -v grep'
        )
        expect(psResult.stdout).toContain('python3 server.py')
        console.log('   ✓ Python 应用正在运行')

        // 测试接口
        console.log('🧪 测试应用接口...')
        const testResult = await devbox.executeCommand(
          'curl -s http://localhost:8000/'
        )
        expect(testResult.stdout).toContain('Python App Running')

        const apiResult = await devbox.executeCommand(
          'curl -s http://localhost:8000/api/info'
        )
        const apiData = JSON.parse(apiResult.stdout)
        expect(apiData.status).toBe('running')

        console.log('\n✅ Python 应用部署测试完成!\n')
      } finally {
        await helper.cleanup()
      }
    },
    600000
  )

  it.skipIf(skipIfNoKubeconfig())(
    '应该支持多步骤构建和部署',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('\n🏗️ 开始多步骤构建部署流程...\n')

        const devbox = await helper.createTestDevbox()
        await helper.waitForDevboxReady(devbox)

        // 步骤 1: 克隆项目结构
        console.log('📦 步骤 1: 创建项目结构...')
        await devbox.executeCommand(`
          mkdir -p /workspace/project/{src,tests,config,scripts}
        `)

        // 步骤 2: 上传源代码
        console.log('📝 步骤 2: 上传源代码...')
        await devbox.uploadFiles({
          '/workspace/project/src/app.js': 'console.log("Main app");',
          '/workspace/project/src/utils.js': 'console.log("Utils");',
          '/workspace/project/tests/test.js': 'console.log("Tests");',
          '/workspace/project/config/config.json': JSON.stringify({ env: 'production' }),
          '/workspace/project/package.json': JSON.stringify({
            name: 'multi-step-app',
            version: '1.0.0',
            scripts: {
              build: 'echo "Building..."',
              test: 'echo "Testing..."',
              start: 'node src/app.js',
            },
          }),
        })

        // 步骤 3: 安装依赖
        console.log('📦 步骤 3: 安装依赖...')
        const installResult = await devbox.executeCommand(
          'cd /workspace/project && npm install',
          { timeout: 120000 }
        )
        expect(installResult.exitCode).toBe(0)

        // 步骤 4: 运行构建
        console.log('🔨 步骤 4: 运行构建...')
        const buildResult = await devbox.executeCommand(
          'cd /workspace/project && npm run build'
        )
        expect(buildResult.exitCode).toBe(0)

        // 步骤 5: 运行测试
        console.log('🧪 步骤 5: 运行测试...')
        const testResult = await devbox.executeCommand(
          'cd /workspace/project && npm run test'
        )
        expect(testResult.exitCode).toBe(0)

        // 步骤 6: 启动应用
        console.log('🚀 步骤 6: 启动应用...')
        const startResult = await devbox.executeCommand(
          'cd /workspace/project && npm start'
        )
        expect(startResult.exitCode).toBe(0)

        console.log('\n✅ 多步骤构建部署测试完成!\n')
      } finally {
        await helper.cleanup()
      }
    },
    600000
  )
})

