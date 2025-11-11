/**
 * Devbox SDK Git 版本控制功能测试
 *
 * 测试目的：
 * 本测试文件用于验证 Devbox SDK 的 Git 版本控制功能，包括：
 * 1. 仓库操作（clone, pull, push）
 * 2. 分支管理（branches, createBranch, deleteBranch, checkoutBranch）
 * 3. 提交操作（add, commit, status）
 *
 * 测试覆盖范围：
 * - 克隆公共仓库
 * - 拉取和推送更改
 * - 分支创建、删除和切换
 * - 文件暂存和提交
 * - 仓库状态查询
 * - 错误处理和边界情况
 *
 * 注意事项：
 * - 所有测试都需要真实的 Devbox 实例（通过 Kubernetes API 创建）
 * - 测试使用 mockServerUrl 连接到本地 Go Server（通过 DEVBOX_SERVER_URL 环境变量配置）
 * - 测试会创建和删除 Devbox 实例，确保测试环境有足够的资源
 * - Git 操作需要容器中已安装 Git
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/DevboxSDK'
import type { DevboxInstance } from '../src/core/DevboxInstance'
import { TEST_CONFIG } from './setup'
import type { DevboxCreateConfig, GitCloneOptions, GitCommitOptions } from '../src/core/types'
import { DevboxRuntime } from '../src/api/types'

async function waitForDevboxReady(devbox: DevboxInstance, timeout = 120000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      await devbox.refreshInfo()
      if (devbox.status === 'Running') {
        await new Promise(resolve => setTimeout(resolve, 3000))
        return
      }
    } catch (error) {
      // Ignore intermediate errors
    }

    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  throw new Error(`Devbox ${devbox.name} did not become ready within ${timeout}ms`)
}

describe('Devbox SDK Git 版本控制功能测试', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance
  const TEST_DEVBOX_NAME = `test-git-ops-${Date.now()}`
  const TEST_REPO_URL = 'https://github.com/octocat/Hello-World.git' // Small public test repo
  const TEST_REPO_DIR = '/tmp/test-repo'

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)

    const config: DevboxCreateConfig = {
      name: TEST_DEVBOX_NAME,
      runtime: DevboxRuntime.NODE_JS,
      resource: {
        cpu: 1,
        memory: 2,
      },
    }

    devboxInstance = await sdk.createDevbox(config)
    await devboxInstance.start()
    await waitForDevboxReady(devboxInstance)
  }, 30000)

  afterEach(async () => {
    if (devboxInstance) {
      try {
        await devboxInstance.delete()
      } catch (error) {
        console.warn('Failed to cleanup devbox:', error)
      }
    }

    if (sdk) {
      await sdk.close()
    }
  }, 10000)

  describe('仓库操作', () => {
    it('应该能够克隆公共仓库', async () => {
      const options: GitCloneOptions = {
        url: TEST_REPO_URL,
        targetDir: TEST_REPO_DIR,
        depth: 1, // Shallow clone for faster testing
      }

      await expect(devboxInstance.clone(options)).resolves.not.toThrow()
    }, 60000)

    it('应该能够克隆特定分支', async () => {
      const options: GitCloneOptions = {
        url: TEST_REPO_URL,
        targetDir: `${TEST_REPO_DIR}-branch`,
        branch: 'master',
        depth: 1,
      }

      await expect(devboxInstance.clone(options)).resolves.not.toThrow()
    }, 60000)

    it('应该能够拉取远程更改', async () => {
      // First clone the repo
      await devboxInstance.clone({
        url: TEST_REPO_URL,
        targetDir: TEST_REPO_DIR,
        depth: 1,
      })

      // Then pull
      await expect(devboxInstance.pull(TEST_REPO_DIR)).resolves.not.toThrow()
    }, 60000)

    it('应该能够获取仓库状态', async () => {
      await devboxInstance.clone({
        url: TEST_REPO_URL,
        targetDir: TEST_REPO_DIR,
        depth: 1,
      })

      const status = await devboxInstance.gitStatus(TEST_REPO_DIR)

      expect(status).toBeDefined()
      expect(status.currentBranch).toBeDefined()
      expect(typeof status.isClean).toBe('boolean')
      expect(Array.isArray(status.staged)).toBe(true)
      expect(Array.isArray(status.modified)).toBe(true)
      expect(Array.isArray(status.untracked)).toBe(true)
      expect(Array.isArray(status.deleted)).toBe(true)
    }, 60000)
  })

  describe('分支管理', () => {
    beforeEach(async () => {
      // Clone repo before each branch test
      await devboxInstance.clone({
        url: TEST_REPO_URL,
        targetDir: TEST_REPO_DIR,
        depth: 1,
      })
    })

    it('应该能够列出所有分支', async () => {
      const branches = await devboxInstance.branches(TEST_REPO_DIR)

      expect(Array.isArray(branches)).toBe(true)
      expect(branches.length).toBeGreaterThan(0)

      if (branches.length > 0) {
        const branch = branches[0]
        expect(branch.name).toBeDefined()
        expect(typeof branch.isCurrent).toBe('boolean')
        expect(typeof branch.isRemote).toBe('boolean')
      }
    }, 30000)

    it('应该能够创建新分支', async () => {
      const branchName = `test-branch-${Date.now()}`

      await expect(devboxInstance.createBranch(TEST_REPO_DIR, branchName)).resolves.not.toThrow()

      // Verify branch exists
      const branches = await devboxInstance.branches(TEST_REPO_DIR)
      const foundBranch = branches.find(b => b.name === branchName)
      expect(foundBranch).toBeDefined()
    }, 30000)

    it('应该能够创建并切换到新分支', async () => {
      const branchName = `test-checkout-branch-${Date.now()}`

      await expect(
        devboxInstance.createBranch(TEST_REPO_DIR, branchName, true)
      ).resolves.not.toThrow()

      // Verify we're on the new branch
      const status = await devboxInstance.gitStatus(TEST_REPO_DIR)
      expect(status.currentBranch).toBe(branchName)
    }, 30000)

    it('应该能够切换分支', async () => {
      // Create a new branch first
      const branchName = `test-switch-${Date.now()}`
      await devboxInstance.createBranch(TEST_REPO_DIR, branchName)

      // Switch to it
      await expect(devboxInstance.checkoutBranch(TEST_REPO_DIR, branchName)).resolves.not.toThrow()

      // Verify we're on the branch
      const status = await devboxInstance.gitStatus(TEST_REPO_DIR)
      expect(status.currentBranch).toBe(branchName)
    }, 30000)

    it('应该能够删除本地分支', async () => {
      const branchName = `test-delete-${Date.now()}`

      // Create branch
      await devboxInstance.createBranch(TEST_REPO_DIR, branchName)

      // Delete branch
      await expect(devboxInstance.deleteBranch(TEST_REPO_DIR, branchName)).resolves.not.toThrow()

      // Verify branch is deleted
      const branches = await devboxInstance.branches(TEST_REPO_DIR)
      const foundBranch = branches.find(b => b.name === branchName && !b.isRemote)
      expect(foundBranch).toBeUndefined()
    }, 30000)
  })

  describe('提交操作', () => {
    beforeEach(async () => {
      await devboxInstance.clone({
        url: TEST_REPO_URL,
        targetDir: TEST_REPO_DIR,
        depth: 1,
      })
    })

    it('应该能够暂存文件', async () => {
      // Create a test file
      const testFile = `${TEST_REPO_DIR}/test-file-${Date.now()}.txt`
      await devboxInstance.writeFile(testFile, 'Test content')

      // Stage the file
      await expect(devboxInstance.add(TEST_REPO_DIR, testFile)).resolves.not.toThrow()

      // Verify file is staged
      const status = await devboxInstance.gitStatus(TEST_REPO_DIR)
      expect(status.staged).toContain(testFile.replace(`${TEST_REPO_DIR}/`, ''))
    }, 30000)

    it('应该能够暂存所有文件', async () => {
      // Create multiple test files
      await devboxInstance.writeFile(`${TEST_REPO_DIR}/file1.txt`, 'Content 1')
      await devboxInstance.writeFile(`${TEST_REPO_DIR}/file2.txt`, 'Content 2')

      // Stage all files
      await expect(devboxInstance.add(TEST_REPO_DIR)).resolves.not.toThrow()

      // Verify files are staged
      const status = await devboxInstance.gitStatus(TEST_REPO_DIR)
      expect(status.staged.length).toBeGreaterThan(0)
    }, 30000)

    it('应该能够提交更改', async () => {
      // Create and stage a file
      const testFile = `${TEST_REPO_DIR}/commit-test-${Date.now()}.txt`
      await devboxInstance.writeFile(testFile, 'Commit test content')
      await devboxInstance.add(TEST_REPO_DIR, testFile)

      // Commit
      const commitOptions: GitCommitOptions = {
        message: `Test commit ${Date.now()}`,
      }

      await expect(devboxInstance.commit(TEST_REPO_DIR, commitOptions)).resolves.not.toThrow()
    }, 30000)

    it('应该能够使用作者信息提交', async () => {
      const testFile = `${TEST_REPO_DIR}/author-test-${Date.now()}.txt`
      await devboxInstance.writeFile(testFile, 'Author test content')
      await devboxInstance.add(TEST_REPO_DIR, testFile)

      const commitOptions: GitCommitOptions = {
        message: `Test commit with author ${Date.now()}`,
        author: {
          name: 'Test User',
          email: 'test@example.com',
        },
      }

      await expect(devboxInstance.commit(TEST_REPO_DIR, commitOptions)).resolves.not.toThrow()
    }, 30000)

    it('应该能够创建空提交', async () => {
      const commitOptions: GitCommitOptions = {
        message: `Empty commit ${Date.now()}`,
        allowEmpty: true,
      }

      await expect(devboxInstance.commit(TEST_REPO_DIR, commitOptions)).resolves.not.toThrow()
    }, 30000)

    it('应该能够获取仓库状态', async () => {
      const status = await devboxInstance.gitStatus(TEST_REPO_DIR)

      expect(status.currentBranch).toBeDefined()
      expect(typeof status.isClean).toBe('boolean')
      expect(typeof status.ahead).toBe('number')
      expect(typeof status.behind).toBe('number')
      expect(Array.isArray(status.staged)).toBe(true)
      expect(Array.isArray(status.modified)).toBe(true)
      expect(Array.isArray(status.untracked)).toBe(true)
      expect(Array.isArray(status.deleted)).toBe(true)
    }, 30000)
  })

  describe('Git 工作流集成测试', () => {
    it('应该能够完成完整的 Git 工作流', async () => {
      // 1. Clone repository
      await devboxInstance.clone({
        url: TEST_REPO_URL,
        targetDir: TEST_REPO_DIR,
        depth: 1,
      })

      // 2. Create a new branch
      const branchName = `feature-${Date.now()}`
      await devboxInstance.createBranch(TEST_REPO_DIR, branchName, true)

      // 3. Create and stage files
      const testFile = `${TEST_REPO_DIR}/workflow-test-${Date.now()}.txt`
      await devboxInstance.writeFile(testFile, 'Workflow test content')
      await devboxInstance.add(TEST_REPO_DIR, testFile)

      // 4. Commit changes
      await devboxInstance.commit(TEST_REPO_DIR, {
        message: `Workflow test commit ${Date.now()}`,
      })

      // 5. Check status
      const status = await devboxInstance.gitStatus(TEST_REPO_DIR)
      expect(status.currentBranch).toBe(branchName)
      expect(status.isClean).toBe(true)

      // 6. List branches
      const branches = await devboxInstance.branches(TEST_REPO_DIR)
      const foundBranch = branches.find(b => b.name === branchName)
      expect(foundBranch).toBeDefined()
    }, 90000)
  })

  describe('错误处理', () => {
    it('应该处理不存在的仓库', async () => {
      const options: GitCloneOptions = {
        url: 'https://github.com/nonexistent/repo-that-does-not-exist.git',
        targetDir: '/tmp/nonexistent-repo',
      }

      await expect(devboxInstance.clone(options)).rejects.toThrow()
    }, 60000)

    it('应该处理不存在的分支', async () => {
      await devboxInstance.clone({
        url: TEST_REPO_URL,
        targetDir: TEST_REPO_DIR,
        depth: 1,
      })

      await expect(
        devboxInstance.checkoutBranch(TEST_REPO_DIR, 'nonexistent-branch-12345')
      ).rejects.toThrow()
    }, 30000)

    it('应该处理在不存在的目录中执行 Git 操作', async () => {
      await expect(devboxInstance.gitStatus('/tmp/nonexistent-repo-12345')).rejects.toThrow()
    }, 10000)

    it('应该处理提交空消息', async () => {
      await devboxInstance.clone({
        url: TEST_REPO_URL,
        targetDir: TEST_REPO_DIR,
        depth: 1,
      })

      // Git commit requires a message, so empty message should fail
      await expect(
        devboxInstance.commit(TEST_REPO_DIR, {
          message: '',
        })
      ).rejects.toThrow()
    }, 30000)
  })
})

