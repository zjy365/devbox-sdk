/**
 * File Transfer Engine
 * Handles file transfer strategies and optimizations
 */

import type { FileMap, TransferProgress, TransferResult } from '../core/types'

export interface TransferStrategy {
  name: string
  canHandle(files: FileMap): boolean
  transfer(
    files: FileMap,
    onProgress?: (progress: TransferProgress) => void
  ): Promise<TransferResult>
}

export class TransferEngine {
  private strategies: TransferStrategy[] = []

  constructor() {
    this.setupDefaultStrategies()
  }

  private setupDefaultStrategies(): void {
    // Default strategies will be added here
  }

  addStrategy(strategy: TransferStrategy): void {
    this.strategies.push(strategy)
  }

  async transferFiles(
    files: FileMap,
    onProgress?: (progress: TransferProgress) => void
  ): Promise<TransferResult> {
    // Select appropriate strategy
    const strategy = this.selectStrategy(files)
    if (!strategy) {
      throw new Error('No suitable transfer strategy found')
    }

    return strategy.transfer(files, onProgress)
  }

  private selectStrategy(files: FileMap): TransferStrategy | null {
    return this.strategies.find(strategy => strategy.canHandle(files)) || null
  }
}
