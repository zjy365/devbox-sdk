#!/usr/bin/env node
/**
 * Generate large test files for upload tests
 * Run this once to create test fixtures
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURES_DIR = __dirname

// Ensure fixtures directory exists
if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true })
}

function generateFile(filename, sizeInMB, char) {
    const filePath = path.join(FIXTURES_DIR, filename)

    // Check if file already exists with correct size
    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath)
        const expectedSize = sizeInMB * 1024 * 1024
        if (stats.size === expectedSize) {
            console.log(`✓ ${filename} already exists with correct size (${sizeInMB}MB)`)
            return Promise.resolve()
        }
    }

    console.log(`Generating ${filename} (${sizeInMB}MB)...`)
    const chunkSize = 1024 * 1024 // 1MB chunks
    const totalChunks = sizeInMB
    const chunk = char.repeat(chunkSize)

    const stream = fs.createWriteStream(filePath)

    for (let i = 0; i < totalChunks; i++) {
        stream.write(chunk)
    }

    stream.end()

    return new Promise((resolve, reject) => {
        stream.on('finish', () => {
            console.log(`✓ Generated ${filename} (${sizeInMB}MB)`)
            resolve()
        })
        stream.on('error', reject)
    })
}

async function main() {
    console.log('Generating test fixture files...\n')

    await generateFile('file-10mb.txt', 10, 'X')
    await generateFile('file-50mb.txt', 50, 'Y')
    await generateFile('file-100mb.txt', 100, 'Z')

    console.log('\n✓ All test files generated successfully!')
    console.log('Files are located in:', FIXTURES_DIR)
}

main().catch(console.error)
