/**
 * 完整工作流集成测试
 */

import { describe, it, expect } from 'vitest'
import { TestHelper, skipIfNoKubeconfig, sleep } from '../setup'

describe('完整工作流集成测试', () => {
  it.skipIf(skipIfNoKubeconfig())(
    '应该完成 Node.js 应用部署流程',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('📦 步骤 1: 创建 Devbox...')
        const devbox = await helper.createTestDevbox({
          ports: [{ number: 3000, protocol: 'HTTP' }],
        })

        console.log('⏳ 步骤 2: 等待 Devbox 就绪...')
        await helper.waitForDevboxReady(devbox)

        console.log('📝 步骤 3: 上传应用代码...')
        await devbox.uploadFiles({
          '/app/package.json': JSON.stringify(
            {
              name: 'test-app',
              version: '1.0.0',
              type: 'module',
              scripts: {
                start: 'node index.js',
              },
            },
            null,
            2
          ),
          '/app/index.js': `
            console.log('Application starting...');
            console.log('Node version:', process.version);
            console.log('Working directory:', process.cwd());
            
            // 简单的 HTTP 服务器（不依赖 express）
            import { createServer } from 'http';
            
            const server = createServer((req, res) => {
              res.writeHead(200, { 'Content-Type': 'text/plain' });
              res.end('OK - Test App Running');
            });
            
            server.listen(3000, '0.0.0.0', () => {
              console.log('Server running on port 3000');
            });
          `,
        })

        console.log('✓ 文件上传成功')

        console.log('🚀 步骤 4: 启动应用...')
        const startResult = await devbox.executeCommand(
          'cd /app && nohup node index.js > /tmp/app.log 2>&1 &',
          {
            timeout: 30000,
          }
        )

        console.log('Start result:', startResult)

        console.log('⏳ 步骤 5: 等待应用启动...')
        await sleep(5000)

        console.log('🔍 步骤 6: 验证应用运行...')
        const psResult = await devbox.executeCommand('ps aux | grep "node index.js" | grep -v grep')
        console.log('Process check:', psResult)

        // 验证进程存在
        expect(psResult.stdout).toContain('node index.js')

        console.log('📋 步骤 7: 检查日志...')
        const logResult = await devbox.executeCommand('cat /tmp/app.log')
        console.log('Application log:', logResult.stdout)

        expect(logResult.stdout).toContain('Application starting')

        console.log('✅ 工作流测试完成')
      } finally {
        await helper.cleanup()
      }
    },
    300000
  ) // 5 minutes timeout

  it.skipIf(skipIfNoKubeconfig())(
    '应该完成文件操作工作流',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('📦 创建 Devbox...')
        const devbox = await helper.createTestDevbox()
        await helper.waitForDevboxReady(devbox)

        console.log('📝 创建项目结构...')
        
        // 创建目录结构
        await devbox.executeCommand('mkdir -p /workspace/src /workspace/tests /workspace/config')
        
        // 上传文件
        const files = {
          '/workspace/README.md': '# Test Project\n\nThis is a test project.',
          '/workspace/src/main.js': 'console.log("Hello World");',
          '/workspace/tests/test.js': 'console.log("Running tests...");',
          '/workspace/config/app.json': JSON.stringify({ port: 3000, env: 'test' }, null, 2),
        }

        await devbox.uploadFiles(files)

        console.log('🔍 验证文件存在...')
        for (const path of Object.keys(files)) {
          const content = await devbox.readFile(path)
          expect(content.toString()).toBe(files[path])
        }

        console.log('📋 列出文件...')
        const srcFiles = await devbox.listFiles('/workspace/src')
        expect(srcFiles).toContain('/workspace/src/main.js')

        console.log('🗑️ 删除文件...')
        await devbox.deleteFile('/workspace/tests/test.js')

        console.log('✅ 文件操作工作流完成')
      } finally {
        await helper.cleanup()
      }
    },
    180000
  )

  it.skipIf(skipIfNoKubeconfig())(
    '应该完成命令执行工作流',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('📦 创建 Devbox...')
        const devbox = await helper.createTestDevbox()
        await helper.waitForDevboxReady(devbox)

        console.log('📝 执行多个命令...')

        // 1. 创建脚本
        const scriptContent = `#!/bin/bash
echo "Script started"
date
echo "Current user: $(whoami)"
echo "Hostname: $(hostname)"
echo "Script completed"
`
        await devbox.writeFile('/tmp/test-script.sh', scriptContent)
        await devbox.executeCommand('chmod +x /tmp/test-script.sh')

        // 2. 执行脚本
        const result = await devbox.executeCommand('/tmp/test-script.sh')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('Script started')
        expect(result.stdout).toContain('Script completed')

        // 3. 测试环境变量
        const envResult = await devbox.executeCommand('echo $TEST_VAR', {
          env: { TEST_VAR: 'hello-world' },
        })
        expect(envResult.stdout).toContain('hello-world')

        // 4. 测试工作目录
        await devbox.executeCommand('mkdir -p /workspace/project')
        const pwdResult = await devbox.executeCommand('pwd', {
          cwd: '/workspace/project',
        })
        expect(pwdResult.stdout).toContain('/workspace/project')

        console.log('✅ 命令执行工作流完成')
      } finally {
        await helper.cleanup()
      }
    },
    180000
  )
})

