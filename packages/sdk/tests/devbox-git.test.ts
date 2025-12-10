/**
 * Devbox SDK Git Version Control Tests
 *
 * Test Purpose:
 * This test file validates Devbox SDK's Git version control functionality, including:
 * 1. Repository operations (clone, pull, push)
 * 2. Branch management (branches, createBranch, deleteBranch, checkoutBranch)
 * 3. Commit operations (add, commit, status)
 *
 * Test Coverage:
 * - Clone public repositories
 * - Pull and push changes
 * - Branch creation, deletion, and switching
 * - File staging and committing
 * - Repository status queries
 * - Error handling and edge cases
 *
 * Notes:
 * - All tests require real Devbox instances (created via Kubernetes API)
 * - Tests use mockServerUrl to connect to local Go Server (configured via DEVBOX_SERVER_URL env var)
 * - Tests will create and delete Devbox instances, ensure test environment has sufficient resources
 * - Git operations require Git to be installed in the container
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG } from './setup'
import type { DevboxCreateConfig, GitCloneOptions } from '../src/core/types'
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

async function ensureCleanClone(
  devboxInstance: DevboxInstance,
  url: string,
  targetDir: string,
  options?: { branch?: string; depth?: number }
): Promise<void> {
  // Clean up directory first to avoid clone conflicts
  try {
    await devboxInstance.execSync({
      command: 'rm',
      args: ['-rf', targetDir],
    })
  } catch (error) {
    // Ignore errors if directory doesn't exist
  }

  // Clone repo
  await devboxInstance.git.clone({
    url,
    targetDir,
    branch: options?.branch,
    depth: options?.depth,
  })
}

describe('Devbox SDK Git Version Control Tests', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance
  const TEST_DEVBOX_NAME = `test-git-ops-${Date.now()}`
  const TEST_REPO_URL = 'https://github.com/zjy365/Hello-World' // Small public test repo
  const TEST_REPO_DIR = './hello-world-repo'

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
    // Clean up test directories
    if (devboxInstance) {
      try {
        // Remove test repository directories
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', TEST_REPO_DIR, `${TEST_REPO_DIR}-branch`],
        })
      } catch (error) {
        // Ignore errors if directories don't exist
        console.warn('Failed to cleanup test directories:', error)
      }

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

  describe('Repository Operations', () => {
    it('should be able to clone public repository', async () => {
      await ensureCleanClone(devboxInstance, TEST_REPO_URL, TEST_REPO_DIR, { depth: 1 })
    }, 60000)

    it('should be able to clone specific branch', async () => {
      await ensureCleanClone(
        devboxInstance,
        TEST_REPO_URL,
        `${TEST_REPO_DIR}-branch`,
        { branch: 'master', depth: 1 }
      )
    }, 60000)

    it('should be able to pull remote changes', async () => {
      await ensureCleanClone(devboxInstance, TEST_REPO_URL, TEST_REPO_DIR, { depth: 1 })
      await expect(devboxInstance.git.pull(TEST_REPO_DIR)).resolves.not.toThrow()
    }, 60000)

    it('should be able to get repository status', async () => {
      await ensureCleanClone(devboxInstance, TEST_REPO_URL, TEST_REPO_DIR, { depth: 1 })
      const status = await devboxInstance.git.status(TEST_REPO_DIR)

      expect(status).toBeDefined()
      expect(status.currentBranch).toBeDefined()
      expect(typeof status.isClean).toBe('boolean')
      expect(Array.isArray(status.staged)).toBe(true)
      expect(Array.isArray(status.modified)).toBe(true)
      expect(Array.isArray(status.untracked)).toBe(true)
      expect(Array.isArray(status.deleted)).toBe(true)
    }, 60000)
  })

  describe('Branch Management', () => {
    beforeEach(async () => {
      await ensureCleanClone(devboxInstance, TEST_REPO_URL, TEST_REPO_DIR, { depth: 1 })
    })

    it('should be able to list all branches', async () => {
      const branches = await devboxInstance.git.branches(TEST_REPO_DIR)

      expect(Array.isArray(branches)).toBe(true)
      expect(branches.length).toBeGreaterThan(0)

      if (branches.length > 0) {
        const branch = branches[0]
        expect(branch?.name).toBeDefined()
        expect(typeof branch?.isCurrent).toBe('boolean')
        expect(typeof branch?.isRemote).toBe('boolean')
      }
    }, 30000)

    it('should be able to create new branch', async () => {
      const branchName = `test-branch-${Date.now()}`

      await expect(devboxInstance.git.createBranch(TEST_REPO_DIR, branchName)).resolves.not.toThrow()

      // Verify branch exists
      const branches = await devboxInstance.git.branches(TEST_REPO_DIR)
      const foundBranch = branches.find(b => b.name === branchName)
      expect(foundBranch).toBeDefined()
    }, 30000)

    it('should be able to create and checkout new branch', async () => {
      const branchName = `test-checkout-branch-${Date.now()}`

      await expect(
        devboxInstance.git.createBranch(TEST_REPO_DIR, branchName, true)
      ).resolves.not.toThrow()

      // Verify we're on the new branch
      const status = await devboxInstance.git.status(TEST_REPO_DIR)
      expect(status.currentBranch).toBe(branchName)
    }, 30000)

    it('should be able to switch branches', async () => {
      // Create a new branch first
      const branchName = `test-switch-${Date.now()}`
      await devboxInstance.git.createBranch(TEST_REPO_DIR, branchName)

      // Switch to it
      await expect(devboxInstance.git.checkoutBranch(TEST_REPO_DIR, branchName)).resolves.not.toThrow()

      // Verify we're on the branch
      const status = await devboxInstance.git.status(TEST_REPO_DIR)
      expect(status.currentBranch).toBe(branchName)
    }, 30000)

    it('should be able to delete local branch', async () => {
      const branchName = `test-delete-${Date.now()}`

      // Create branch
      await devboxInstance.git.createBranch(TEST_REPO_DIR, branchName)

      // Delete branch
      await expect(devboxInstance.git.deleteBranch(TEST_REPO_DIR, branchName)).resolves.not.toThrow()

      // Verify branch is deleted
      const branches = await devboxInstance.git.branches(TEST_REPO_DIR)
      const foundBranch = branches.find(b => b.name === branchName && !b.isRemote)
      expect(foundBranch).toBeUndefined()
    }, 30000)
  })

  describe('Commit Operations', () => {
    beforeEach(async () => {
      await ensureCleanClone(devboxInstance, TEST_REPO_URL, TEST_REPO_DIR, { depth: 1 })
    })

    it('should be able to stage files', async () => {
      // Create a test file
      const testFile = `${TEST_REPO_DIR}/test-file-${Date.now()}.txt`
      await devboxInstance.writeFile(testFile, 'Test content')

      // Stage the file
      await expect(devboxInstance.git.add(TEST_REPO_DIR, testFile)).resolves.not.toThrow()

      // Verify file is staged
      const status = await devboxInstance.git.status(TEST_REPO_DIR)
      expect(status.staged).toContain(testFile.replace(`${TEST_REPO_DIR}/`, ''))
    }, 30000)

    it('should be able to stage all files', async () => {
      // Create multiple test files
      await devboxInstance.writeFile(`${TEST_REPO_DIR}/file1.txt`, 'Content 1')
      await devboxInstance.writeFile(`${TEST_REPO_DIR}/file2.txt`, 'Content 2')

      // Stage all files
      await expect(devboxInstance.git.add(TEST_REPO_DIR)).resolves.not.toThrow()

      // Verify files are staged
      const status = await devboxInstance.git.status(TEST_REPO_DIR)
      expect(status.staged.length).toBeGreaterThan(0)
    }, 30000)

    it.skip('should be able to commit changes', async () => {
      // Create and stage a file
      const testFile = `${TEST_REPO_DIR}/commit-test-${Date.now()}.txt`
      await devboxInstance.writeFile(testFile, 'Commit test content')
      await devboxInstance.git.add(TEST_REPO_DIR, testFile)

      // Commit
      await expect(
        devboxInstance.git.commit(
          TEST_REPO_DIR,
          `Test commit ${Date.now()}`,
          'Test User',
          'test@example.com'
        )
      ).resolves.not.toThrow()
    }, 30000)

    it.skip('should be able to commit with author information', async () => {
      const testFile = `${TEST_REPO_DIR}/author-test-${Date.now()}.txt`
      await devboxInstance.writeFile(testFile, 'Author test content')
      await devboxInstance.git.add(TEST_REPO_DIR, testFile)

      await expect(
        devboxInstance.git.commit(
          TEST_REPO_DIR,
          `Test commit with author ${Date.now()}`,
          'Test User',
          'test@example.com'
        )
      ).resolves.not.toThrow()
    }, 30000)

    it.skip('should be able to create empty commit', async () => {
      await expect(
        devboxInstance.git.commit(
          TEST_REPO_DIR,
          `Empty commit ${Date.now()}`,
          'Test User',
          'test@example.com',
          true
        )
      ).resolves.not.toThrow()
    }, 30000)

    it('should be able to get repository status', async () => {
      const status = await devboxInstance.git.status(TEST_REPO_DIR)

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

  describe('Git Workflow Integration Tests', () => {
    it.skip('should be able to complete full Git workflow', async () => {
      await ensureCleanClone(devboxInstance, TEST_REPO_URL, TEST_REPO_DIR, { depth: 1 })

      // 2. Create a new branch
      const branchName = `feature-${Date.now()}`
      await devboxInstance.git.createBranch(TEST_REPO_DIR, branchName, true)

      // 3. Create and stage files
      const testFile = `${TEST_REPO_DIR}/workflow-test-${Date.now()}.txt`
      await devboxInstance.writeFile(testFile, 'Workflow test content')
      await devboxInstance.git.add(TEST_REPO_DIR, testFile)

      // 4. Commit changes
      await devboxInstance.git.commit(
        TEST_REPO_DIR,
        `Workflow test commit ${Date.now()}`,
        'Test User',
        'test@example.com'
      )

      // 5. Check status
      const status = await devboxInstance.git.status(TEST_REPO_DIR)
      expect(status.currentBranch).toBe(branchName)
      expect(status.isClean).toBe(true)

      // 6. List branches
      const branches = await devboxInstance.git.branches(TEST_REPO_DIR)
      const foundBranch = branches.find(b => b.name === branchName)
      expect(foundBranch).toBeDefined()
    }, 90000)
  })

  describe('Error Handling', () => {
    it('should handle non-existent repository', async () => {
      const options: GitCloneOptions = {
        url: 'https://github.com/nonexistent/repo-that-does-not-exist.git',
        targetDir: '/tmp/nonexistent-repo',
      }

      await expect(devboxInstance.git.clone(options)).rejects.toThrow()
    }, 60000)

    it('should handle non-existent branch', async () => {
      await ensureCleanClone(devboxInstance, TEST_REPO_URL, TEST_REPO_DIR, { depth: 1 })
      await expect(
        devboxInstance.git.checkoutBranch(TEST_REPO_DIR, 'nonexistent-branch-12345')
      ).rejects.toThrow()
    }, 30000)

    it('should handle Git operations in non-existent directory', async () => {
      await expect(devboxInstance.git.status('/tmp/nonexistent-repo-12345')).rejects.toThrow()
    }, 10000)

    it('should handle empty commit message', async () => {
      await ensureCleanClone(devboxInstance, TEST_REPO_URL, TEST_REPO_DIR, { depth: 1 })
      await expect(
        devboxInstance.git.commit(TEST_REPO_DIR, '', 'Test User', 'test@example.com')
      ).rejects.toThrow()
    }, 30000)
  })
})

