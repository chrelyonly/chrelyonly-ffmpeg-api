const path = require('path');
const fs = require('fs').promises;

/**
 * 解析FFmpeg输出的视频元数据
 * @param {string} metadata - FFmpeg输出的元数据字符串
 * @returns {Object} 解析后的视频元数据对象
 */
function parseVideoMetadata(metadata) {
  const result = {
    format: 'unknown',
    duration: 0,
    size: 0,
    bitrate: 0,
    width: 0,
    height: 0,
    fps: 0,
    codec: {
      video: 'unknown',
      audio: 'unknown'
    },
    audio: {
      sampleRate: 0,
      channels: 0
    }
  };

  // 解析格式信息
  const formatMatch = metadata.match(/Duration: ([\d:.]+), start:/);
  if (formatMatch) {
    const timeParts = formatMatch[1].split(':');
    result.duration = 
      parseFloat(timeParts[0]) * 3600 + 
      parseFloat(timeParts[1]) * 60 + 
      parseFloat(timeParts[2]);
  }

  const sizeMatch = metadata.match(/size=\s+(\d+)kB/);
  if (sizeMatch) {
    result.size = parseInt(sizeMatch[1]) * 1024; // 转换为字节
  }

  const bitrateMatch = metadata.match(/bitrate=\s+(\d+(?:\.\d+)?)\s+k?bps/);
  if (bitrateMatch) {
    result.bitrate = parseFloat(bitrateMatch[1]);
    if (bitrateMatch[0].includes('kbps')) {
      result.bitrate *= 1000;
    }
  }

  // 解析视频流信息
  const videoStreamMatch = metadata.match(/Stream #\d+:\d+.*Video: ([\w-]+).*(\d+)x(\d+).*fps, ([\d.]+) fps/);
  if (videoStreamMatch) {
    result.codec.video = videoStreamMatch[1];
    result.width = parseInt(videoStreamMatch[2]);
    result.height = parseInt(videoStreamMatch[3]);
    result.fps = parseFloat(videoStreamMatch[4]);
  }

  // 解析音频流信息
  const audioStreamMatch = metadata.match(/Stream #\d+:\d+.*Audio: ([\w-]+), (\d+) Hz, ([\w\d.]+)\.?/);
  if (audioStreamMatch) {
    result.codec.audio = audioStreamMatch[1];
    result.audio.sampleRate = parseInt(audioStreamMatch[2]);
    result.audio.channels = audioStreamMatch[3] === 'stereo' ? 2 : parseInt(audioStreamMatch[3]) || 1;
  }

  // 获取文件格式
  const formatMatch2 = metadata.match(/Input #\d+, (\w+)/);
  if (formatMatch2) {
    result.format = formatMatch2[1];
  }

  return result;
}

/**
 * 计算进度百分比
 * @param {number} currentTime - 当前时间（秒）
 * @param {number} totalDuration - 总时长（秒）
 * @returns {number} 进度百分比（0-100）
 */
function calculateProgress(currentTime, totalDuration) {
  if (!totalDuration || totalDuration <= 0) return 0;
  const progress = Math.min(100, Math.max(0, (currentTime / totalDuration) * 100));
  return Math.round(progress * 10) / 10; // 保留一位小数
}

/**
 * 生成唯一的输出文件名
 * @param {string} param1 - 原始文件名或操作类型
 * @param {string} param2 - 操作类型或扩展名
 * @param {string} param3 - 扩展名（可选）
 * @returns {string} 生成的唯一文件名
 */
function generateOutputFilename(param1, param2, param3) {
  // 处理不同的参数调用方式
  let originalFilename, operation, extension;
  
  // 情况1: generateOutputFilename(originalFilename, operation, extension)
  if (param3) {
    originalFilename = param1;
    operation = param2;
    extension = param3;
  }
  // 情况2: generateOutputFilename(operation, extension)
  else if (param2) {
    originalFilename = param1; // 这里将操作类型作为基础名称
    operation = '';
    extension = param2;
  }
  // 情况3: generateOutputFilename(originalFilename)
  else {
    originalFilename = param1;
    operation = '';
    extension = path.extname(originalFilename).substring(1) || 'mp4';
  }
  
  const baseName = path.basename(originalFilename, path.extname(originalFilename));
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  
  // 根据是否有operation参数构建文件名
  if (operation) {
    return `${baseName}_${operation}_${timestamp}_${randomStr}.${extension}`;
  } else {
    return `${baseName}_${timestamp}_${randomStr}.${extension}`;
  }
}

/**
 * 计算压缩率
 * @param {number} originalSize - 原始文件大小（字节）
 * @param {number} compressedSize - 压缩后文件大小（字节）
 * @returns {string} 压缩率百分比字符串
 */
function calculateCompressionRatio(originalSize, compressedSize) {
  if (!originalSize || originalSize <= 0) return '0%';
  const ratio = ((originalSize - compressedSize) / originalSize) * 100;
  return `${ratio.toFixed(1)}%`;
}

/**
 * 获取文件大小
 * @param {string} filePath - 文件路径
 * @returns {Promise<number>} 文件大小（字节）
 */
async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    console.error(`获取文件大小失败 ${filePath}:`, error);
    return 0;
  }
}

/**
 * 格式化时长
 * @param {number} seconds - 时长（秒）
 * @returns {string} 格式化的时长字符串 (HH:MM:SS)
 */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '00:00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

/**
 * 验证视频分辨率
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @returns {boolean} 是否为有效分辨率
 */
function validateResolution(width, height) {
  return Number.isInteger(width) && 
         Number.isInteger(height) && 
         width > 0 && 
         height > 0 && 
         width <= 8192 && // 限制最大分辨率
         height <= 8192;
}

/**
 * 验证视频比特率
 * @param {string|number} bitrate - 比特率
 * @returns {boolean} 是否为有效比特率
 */
function validateBitrate(bitrate) {
  const bitrateNum = Number(bitrate);
  return !isNaN(bitrateNum) && bitrateNum > 0 && bitrateNum <= 100000; // 限制最大比特率
}

/**
 * 根据质量预设获取对应的比特率
 * @param {string} quality - 质量预设 ('low', 'medium', 'high')
 * @param {number} originalBitrate - 原始比特率
 * @returns {number} 建议的比特率
 */
function getBitrateFromQuality(quality, originalBitrate = 5000000) {
  const qualityMap = {
    low: 0.3,
    medium: 0.6,
    high: 0.8
  };
  
  const factor = qualityMap[quality] || 0.6; // 默认medium
  return Math.max(100000, Math.round(originalBitrate * factor));
}

/**
 * 清理临时文件
 * @param {Array<string>} filePaths - 文件路径数组
 */
async function cleanupTempFiles(filePaths) {
  if (!Array.isArray(filePaths)) return;
  
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error(`清理临时文件失败 ${filePath}:`, error);
      // 继续处理其他文件
    }
  }
}

/**
 * 验证文件扩展名
 * @param {string} filename - 文件名
 * @param {Array<string>} allowedExtensions - 允许的扩展名数组
 * @throws {Error} 如果扩展名不允许
 */
function validateFileExtension(filename, allowedExtensions) {
  const extension = path.extname(filename).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    throw new Error(`不支持的文件格式。支持的格式: ${allowedExtensions.join(', ')}`);
  }
}

/**
 * 记录处理进度
 * @param {string} operation - 操作名称
 * @param {number} percent - 进度百分比
 */
function logProgress(operation, percent) {
  const progress = percent || 0;
  console.log(`[${new Date().toISOString()}] ${operation} 进度: ${progress.toFixed(1)}%`);
}

/**
 * 移除单个临时文件
 * @param {string} filePath - 文件路径
 */
async function removeTempFile(filePath) {
  try {
    await fs.unlink(filePath);
    console.log(`临时文件已删除: ${filePath}`);
  } catch (error) {
    console.error(`删除临时文件失败 ${filePath}:`, error);
  }
}

/**
 * 创建临时目录
 * @param {string} prefix - 目录前缀
 * @returns {string} 创建的临时目录路径
 */
function createTempDirectory(prefix) {
  const fsSync = require('fs');
  const tempDirBase = path.join(__dirname, '../temp');
  
  // 确保基础临时目录存在
  ensureDirectoryExists(tempDirBase);
  
  // 创建唯一的子目录
  const uniqueId = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const tempDir = path.join(tempDirBase, uniqueId);
  
  fsSync.mkdirSync(tempDir, { recursive: true });
  console.log(`创建临时目录: ${tempDir}`);
  
  return tempDir;
}

/**
 * 统一错误处理函数
 * @param {Object} res - Express响应对象
 * @param {string} message - 错误消息
 * @param {Error} error - 错误对象
 */
function handleError(res, message, error) {
  res.status(500).json({
    success: false,
    message,
    error: error.message || String(error),
    details: error.details || undefined
  });
}

/**
 * 清理目录
 * @param {string} dirPath - 目录路径
 */
async function cleanupDir(dirPath) {
  if (!dirPath) return;
  
  try {
    const fsSync = require('fs');
    if (fsSync.existsSync(dirPath)) {
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          await cleanupDir(filePath);
        } else {
          await fs.unlink(filePath);
        }
      }
      
      await fs.rmdir(dirPath);
      console.log(`目录已清理: ${dirPath}`);
    }
  } catch (error) {
    console.error(`清理目录失败 ${dirPath}:`, error);
  }
}

/**
 * 格式化文件大小
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化的文件大小字符串
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 确保目录存在
 * @param {string} dirPath - 目录路径
 */
function ensureDirectoryExists(dirPath) {
  const fsSync = require('fs');
  if (!fsSync.existsSync(dirPath)) {
    fsSync.mkdirSync(dirPath, { recursive: true });
    console.log(`创建目录: ${dirPath}`);
  }
}

module.exports = {
  parseVideoMetadata,
  calculateProgress,
  generateOutputFilename,
  calculateCompressionRatio,
  getFileSize,
  formatDuration,
  formatFileSize,
  validateResolution,
  validateBitrate,
  getBitrateFromQuality,
  cleanupTempFiles,
  validateFileExtension,
  logProgress,
  removeTempFile,
  createTempDirectory,
  handleError,
  cleanupDir,
  ensureDirectoryExists
};