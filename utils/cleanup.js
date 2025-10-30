const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { promisify } = require('util');

// 异步文件操作
const readdirAsync = promisify(fsSync.readdir);
const statAsync = promisify(fsSync.stat);
const unlinkAsync = promisify(fsSync.unlink);
const rmdirAsync = promisify(fsSync.rmdir);

/**
 * 递归删除目录
 * @param {string} dirPath - 要删除的目录路径
 * @returns {Promise<void>}
 */
async function deleteDirectoryRecursive(dirPath) {
    try {
        if (!fsSync.existsSync(dirPath)) {
            return;
        }

        const files = await readdirAsync(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = await statAsync(filePath);
            
            if (stat.isDirectory()) {
                await deleteDirectoryRecursive(filePath);
            } else {
                await unlinkAsync(filePath);
            }
        }
        
        await rmdirAsync(dirPath);
        console.log(`已清理目录: ${dirPath}`);
    } catch (error) {
        console.error(`清理目录失败 ${dirPath}:`, error);
    }
}

/**
 * 删除超过指定时间的文件
 * @param {string} dirPath - 要清理的目录路径
 * @param {number} maxAgeMs - 文件最大保留时间（毫秒）
 * @returns {Promise<{deleted: number, total: number}>}
 */
async function deleteOldFiles(dirPath, maxAgeMs = 3600000) { // 默认1小时
    let deletedCount = 0;
    let totalCount = 0;
    
    try {
        if (!fsSync.existsSync(dirPath)) {
            return { deleted: 0, total: 0 };
        }

        const now = Date.now();
        const files = await readdirAsync(dirPath);
        totalCount = files.length;
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = await statAsync(filePath);
            
            if (stat.isDirectory()) {
                // 递归清理子目录
                const result = await deleteOldFiles(filePath, maxAgeMs);
                deletedCount += result.deleted;
                totalCount += result.total;
                
                // 如果子目录为空，则删除
                const subFiles = await readdirAsync(filePath);
                if (subFiles.length === 0) {
                    await rmdirAsync(filePath);
                }
            } else if (now - stat.mtimeMs > maxAgeMs) {
                // 文件超过最大保留时间
                await unlinkAsync(filePath);
                deletedCount++;
            }
        }
        
        console.log(`清理目录 ${dirPath}: 删除了 ${deletedCount}/${totalCount} 个文件`);
    } catch (error) {
        console.error(`清理过期文件失败 ${dirPath}:`, error);
    }
    
    return { deleted: deletedCount, total: totalCount };
}

/**
 * 获取目录大小
 * @param {string} dirPath - 目录路径
 * @returns {Promise<number>} 目录大小（字节）
 */
async function getDirectorySize(dirPath) {
    let totalSize = 0;
    
    try {
        if (!fsSync.existsSync(dirPath)) {
            return 0;
        }

        const files = await readdirAsync(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = await statAsync(filePath);
            
            if (stat.isDirectory()) {
                totalSize += await getDirectorySize(filePath);
            } else {
                totalSize += stat.size;
            }
        }
    } catch (error) {
        console.error(`获取目录大小失败 ${dirPath}:`, error);
    }
    
    return totalSize;
}

/**
 * 格式化字节数
 * @param {number} bytes - 字节数
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的大小字符串
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 执行定时清理任务
 * @param {Object} options - 清理选项
 * @param {string} options.tempDir - 临时目录路径
 * @param {string} options.cacheDir - 缓存目录路径
 * @param {string} options.uploadsDir - 上传目录路径
 * @param {number} options.intervalMs - 清理间隔（毫秒）
 * @param {number} options.maxAgeMs - 文件最大保留时间（毫秒）
 * @param {boolean} options.onlyTemp - 仅清理临时目录
 * @param {boolean} options.onlyCache - 仅清理缓存目录
 */
function scheduleCleanup(options = {}) {
    const {
        tempDir = path.join(__dirname, '../temp'),
        cacheDir = path.join(__dirname, '../cache'),
        uploadsDir = path.join(__dirname, '../uploads'),
        intervalMs = 3600000, // 默认1小时
        maxAgeMs = 7200000, // 默认2小时
        onlyTemp = false,
        onlyCache = false
    } = options;

    // 确保目录存在
    const dirs = [tempDir, cacheDir];
    if (uploadsDir) dirs.push(uploadsDir);
    
    for (const dir of dirs) {
        if (!fsSync.existsSync(dir)) {
            try {
                fsSync.mkdirSync(dir, { recursive: true });
                console.log(`创建目录: ${dir}`);
            } catch (error) {
                console.error(`创建目录失败 ${dir}:`, error.message);
            }
        }
    }

    // 立即执行一次清理
    performCleanup(tempDir, cacheDir, maxAgeMs, onlyTemp, onlyCache, uploadsDir);

    // 设置定时任务
    const timer = setInterval(() => {
        performCleanup(tempDir, cacheDir, maxAgeMs, onlyTemp, onlyCache, uploadsDir);
    }, intervalMs);

    console.log(`已设置定时清理任务，间隔 ${intervalMs / 60000} 分钟`);
    
    return {
        stop: () => {
            clearInterval(timer);
            console.log('已停止定时清理任务');
        }
    };
}

/**
 * 执行清理操作
 * @param {string} tempDir - 临时目录路径
 * @param {string} cacheDir - 缓存目录路径
 * @param {number} maxAgeMs - 文件最大保留时间（毫秒）
 * @param {boolean} onlyTemp - 仅清理临时目录
 * @param {boolean} onlyCache - 仅清理缓存目录
 * @param {string} uploadsDir - 上传目录路径
 */
async function performCleanup(tempDir, cacheDir, maxAgeMs, onlyTemp = false, onlyCache = false, uploadsDir) {
    console.log(`\n开始执行清理任务 (${new Date().toISOString()})`);
    
    // 根据选项决定清理内容
    try {
        if (onlyTemp) {
            console.log('仅清理临时目录...');
            await deleteDirectoryRecursive(tempDir);
            fsSync.mkdirSync(tempDir, { recursive: true });
        } else if (onlyCache) {
            console.log('仅清理缓存目录...');
            await deleteDirectoryRecursive(cacheDir);
            fsSync.mkdirSync(cacheDir, { recursive: true });
        } else {
            // 默认清理：删除旧文件
            console.log('清理旧文件...');
            await deleteOldFiles(tempDir, maxAgeMs);
            await deleteOldFiles(cacheDir, maxAgeMs);
            
            // 如果提供了上传目录，也进行清理
            if (uploadsDir && fsSync.existsSync(uploadsDir)) {
                await deleteOldFiles(uploadsDir, maxAgeMs * 2); // 上传目录保留时间更长
            }
        }
    } catch (error) {
        console.error('清理过程中发生错误:', error.message);
    }
    
    // 输出目录大小统计
    let tempSize = 0, cacheSize = 0, uploadsSize = 0;
    try {
        tempSize = await getDirectorySize(tempDir);
        cacheSize = await getDirectorySize(cacheDir);
        if (uploadsDir) {
            uploadsSize = await getDirectorySize(uploadsDir);
        }
    } catch (error) {
        console.error('获取目录大小失败:', error.message);
    }
    
    console.log(`清理任务完成:`);
    console.log(`  临时目录大小: ${formatBytes(tempSize)}`);
    console.log(`  缓存目录大小: ${formatBytes(cacheSize)}`);
    if (uploadsDir) {
        console.log(`  上传目录大小: ${formatBytes(uploadsSize)}`);
    }
    const totalSize = tempSize + cacheSize + uploadsSize;
    console.log(`  总大小: ${formatBytes(totalSize)}`);
}

// 清理临时文件（用于单个处理完成后）
async function cleanupTempFiles(filePaths) {
  if (!filePaths || filePaths.length === 0) return;
  
  await Promise.all(
    filePaths.map(async (filePath) => {
      if (!filePath) return;
      try {
        if (await fs.stat(filePath).catch(() => null)) {
          await fs.unlink(filePath);
          console.log(`已清理临时文件: ${filePath}`);
        }
      } catch (error) {
        console.error(`清理文件失败 ${filePath}:`, error.message);
      }
    })
  );
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    onlyTemp: args.includes('--only-temp'),
    onlyCache: args.includes('--only-cache'),
    force: args.includes('--force')
  };
}

module.exports = {
    deleteDirectoryRecursive,
    deleteOldFiles,
    getDirectorySize,
    formatBytes,
    scheduleCleanup,
    performCleanup,
    cleanupTempFiles
};

// 如果直接运行此文件，则执行清理并退出
if (require.main === module) {
  console.log('手动执行清理...');
  const args = parseArgs();
  
  performCleanup(
    args.tempDir || path.join(__dirname, '../temp'),
    args.cacheDir || path.join(__dirname, '../cache'),
    7200000 // 默认2小时
  )
    .then(() => {
      console.log('清理脚本执行完毕');
      process.exit(0);
    })
    .catch(error => {
      console.error('清理脚本执行失败:', error.message);
      process.exit(1);
    });
}