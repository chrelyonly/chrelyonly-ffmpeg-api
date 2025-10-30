const express = require('express');
const router = express.Router();
const ffmpeg = require('../utils/ffmpegConfig');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// 导入视频处理工具函数
const {
  parseVideoMetadata,
  calculateProgress,
  generateOutputFilename,
  calculateCompressionRatio,
  getFileSize,
  formatDuration,
  validateResolution,
  validateBitrate,
  getBitrateFromQuality,
  cleanupTempFiles
} = require('../utils/videoUtils');

// 配置上传存储
const uploadDir = path.join(__dirname, '../uploads');
const tempDir = path.join(__dirname, '../temp');

// 确保上传目录存在
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`创建目录: ${dirPath}`);
  }
};

ensureDirectoryExists(uploadDir);
ensureDirectoryExists(tempDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// 生成公共URL路径
function generatePublicUrl(filePath) {
  return `/uploads/${path.basename(filePath)}`;
}

// 处理常见的错误和清理
const handleError = (res, error, videoPath, outputPath = null, customMessage = '处理失败') => {
  console.error(`${customMessage}:`, error);
  
  // 清理临时文件和可能生成的部分文件
  const filesToClean = [videoPath];
  if (outputPath && fs.existsSync(outputPath)) {
    filesToClean.push(outputPath);
  }
  
  cleanupTempFiles(filesToClean).catch(err => {
    console.error('清理临时文件失败:', err);
  });
  
  res.status(500).json({
    success: false,
    message: customMessage,
    error: error.message || String(error),
    details: error.details || undefined
  });
}

// 视频信息获取接口
router.post('/info', upload.single('video'), async (req, res) => {
  try {
    const startTime = Date.now();
    const videoPath = req.file.path;
    
    ffmpeg.ffprobe(videoPath, async (err, ffprobeData) => {
      if (err) {
        return handleError(res, err, videoPath, null, '获取视频信息失败');
      }
      
      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      
      // 提取关键信息
      const simplifiedMetadata = {
        format: ffprobeData.format.format_name,
        duration: parseFloat(ffprobeData.format.duration.toFixed(2)),
        size: parseInt(ffprobeData.format.size),
        bitrate: parseInt(ffprobeData.format.bit_rate / 1000), // kbps
        streams: ffprobeData.streams.map(stream => ({
          type: stream.codec_type,
          codec: stream.codec_name,
          width: stream.width,
          height: stream.height,
          fps: stream.codec_type === 'video' ? eval(stream.r_frame_rate) : undefined,
          sampleRate: stream.codec_type === 'audio' ? stream.sample_rate : undefined,
          channels: stream.codec_type === 'audio' ? stream.channels : undefined
        })).filter(stream => stream.type === 'video' || stream.type === 'audio')
      };
      
      // 获取视频流信息
      const videoStream = simplifiedMetadata.streams.find(s => s.type === 'video');
      
      res.status(200).json({
        success: true,
        message: '获取视频信息成功',
        processingTime,
        fileSize: await getFileSize(videoPath),
        metadata: {
          format: simplifiedMetadata.format,
          duration: simplifiedMetadata.duration,
          formattedDuration: formatDuration(simplifiedMetadata.duration),
          width: videoStream?.width,
          height: videoStream?.height,
          fps: videoStream?.fps ? parseFloat(videoStream.fps.toFixed(2)) : undefined,
          bitrate: simplifiedMetadata.bitrate,
          streams: simplifiedMetadata.streams
        }
      });
      
      // 清理临时文件
      cleanupTempFiles([videoPath]).catch(err => {
        console.error('清理临时文件失败:', err);
      });
    });
  } catch (error) {
    handleError(res, error, req.file?.path || null, null, '处理视频信息请求失败');
  }
});

// 视频格式转换接口
router.post('/convert', upload.single('video'), async (req, res) => {
  try {
    const startTime = Date.now();
    const { format } = req.body;
    const videoPath = req.file.path;
    
    // 支持的格式列表
    const supportedFormats = ['mp4', 'avi', 'mov', 'webm', 'mkv'];
    
    if (!format || !supportedFormats.includes(format)) {
      await cleanupTempFiles([videoPath]);
      return res.status(400).json({
        success: false,
        message: `不支持的格式，请选择以下格式之一: ${supportedFormats.join(', ')}`
      });
    }
    
    const outputFilename = generateOutputFilename(req.file.originalname, 'converted', format);
    const outputPath = path.join(uploadDir, outputFilename);
    
    // 根据目标格式设置适当的编码器
    const formatOptions = {
      mp4: {
        videoCodec: 'libx264',
        audioCodec: 'aac',
        options: ['-crf', '23', '-preset', 'medium']
      },
      webm: {
        videoCodec: 'libvpx-vp9',
        audioCodec: 'libopus',
        options: ['-crf', '30', '-b:v', '0']
      },
      avi: {
        videoCodec: 'mpeg4',
        audioCodec: 'libmp3lame',
        options: ['-qscale:v', '2']
      },
      mov: {
        videoCodec: 'libx264',
        audioCodec: 'aac',
        options: ['-crf', '23', '-preset', 'medium']
      },
      mkv: {
        videoCodec: 'libx264',
        audioCodec: 'aac',
        options: ['-crf', '23', '-preset', 'medium']
      }
    };
    
    const currentOptions = formatOptions[format] || formatOptions.mp4;
    
    let command = ffmpeg(videoPath)
      .output(outputPath)
      .videoCodec(currentOptions.videoCodec)
      .audioCodec(currentOptions.audioCodec);
    
    // 添加额外选项
    currentOptions.options.forEach(option => {
      command = command.addOption(option);
    });
    
    command
      .on('start', (cmdLine) => {
        console.log(`转换开始: ${cmdLine}`);
      })
      .on('progress', (progress) => {
        if (progress.timemark) {
          console.log(`转换进度: ${progress.timemark}`);
        }
      })
      .on('end', async () => {
        try {
          const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
          const outputSize = await getFileSize(outputPath);
          
          res.status(200).json({
            success: true,
            message: '格式转换成功',
            processingTime,
            fileSize: outputSize,
            outputFormat: format,
            output_url: generatePublicUrl(outputPath)
          });
        } catch (error) {
          console.error('获取文件信息失败:', error);
        } finally {
          // 清理临时文件
          await cleanupTempFiles([videoPath]);
        }
      })
      .on('error', (err) => {
        handleError(res, err, videoPath, outputPath, '格式转换失败');
      })
      .run();
  } catch (error) {
    handleError(res, error, req.file?.path || null, null, '处理视频格式转换请求失败');
  }
});

// 视频剪切接口
router.post('/trim', upload.single('video'), async (req, res) => {
  try {
    const startTime = Date.now();
    const { startTime: trimStart, endTime } = req.body;
    const videoPath = req.file.path;
    const outputFilename = generateOutputFilename(req.file.originalname, 'trimmed', 'mp4');
    const outputPath = path.join(uploadDir, outputFilename);
    
    // 验证参数
    if (!trimStart && trimStart !== 0) {
      await cleanupTempFiles([videoPath]);
      return res.status(400).json({
        success: false,
        message: '请指定开始时间'
      });
    }
    
    if (!endTime && endTime !== 0) {
      await cleanupTempFiles([videoPath]);
      return res.status(400).json({
        success: false,
        message: '请指定结束时间'
      });
    }
    
    // 转换为数字
    const start = parseFloat(trimStart);
    const end = parseFloat(endTime);
    
    if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
      await cleanupTempFiles([videoPath]);
      return res.status(400).json({
        success: false,
        message: '无效的时间参数'
      });
    }
    
    // 获取原始视频长度进行验证
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        return handleError(res, err, videoPath, null, '获取视频信息失败');
      }
      
      const videoDuration = parseFloat(metadata.format.duration);
      
      if (end > videoDuration) {
        cleanupTempFiles([videoPath]).catch(cleanupErr => {
          console.error('清理临时文件失败:', cleanupErr);
        });
        return res.status(400).json({
          success: false,
          message: `结束时间不能超过视频长度 ${videoDuration} 秒`
        });
      }
      
      // 构建FFmpeg命令
      const command = ffmpeg(videoPath);
      
      // 设置剪切参数
      command.inputOptions([`-ss ${start}`, `-to ${end}`]);
      
      // 如果剪切范围超过5秒，则需要重新编码以确保质量
      const needReencode = end - start > 5;
      
      if (needReencode) {
        command
          .outputOptions(['-c:v libx264', '-c:a aac', '-crf 23', '-preset medium'])
          .output(outputPath);
      } else {
        // 短片段可以使用快速模式，不重新编码
        command
          .outputOptions(['-c:v copy', '-c:a copy'])
          .output(outputPath);
      }
      
      command
        .on('start', (cmdLine) => {
          console.log(`剪切开始: ${cmdLine}`);
        })
        .on('progress', (progress) => {
          if (progress.timemark) {
            console.log(`剪切进度: ${progress.timemark}`);
          }
        })
        .on('end', async () => {
          try {
            const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
            const outputSize = await getFileSize(outputPath);
            
            res.status(200).json({
              success: true,
              message: '视频剪切成功',
              processingTime,
              fileSize: outputSize,
              trimInfo: {
                startTime: start,
                endTime: end,
                duration: end - start,
                formattedDuration: formatDuration(end - start)
              },
              reencoded: needReencode,
              output_url: generatePublicUrl(outputPath)
            });
          } catch (error) {
            console.error('获取文件信息失败:', error);
          } finally {
            // 清理临时文件
            await cleanupTempFiles([videoPath]);
          }
        })
        .on('error', (err) => {
          handleError(res, err, videoPath, outputPath, '剪切失败');
        })
        .run();
    });
  } catch (error) {
    handleError(res, error, req.file?.path || null, null, '处理视频剪切请求失败');
  }
});

// 视频压缩接口
router.post('/compress', upload.single('video'), async (req, res) => {
  try {
    const startTime = Date.now();
    const { quality, bitrate } = req.body;
    const videoPath = req.file.path;
    const outputFilename = generateOutputFilename(req.file.originalname, 'compressed', 'mp4');
    const outputPath = path.join(uploadDir, outputFilename);
    
    // 根据quality参数设置比特率
    let targetBitrate;
    if (bitrate && !isNaN(parseInt(bitrate))) {
      // 验证自定义比特率
      if (!validateBitrate(bitrate)) {
        await cleanupTempFiles([videoPath]);
        return res.status(400).json({
          success: false,
          message: '无效的比特率值'
        });
      }
      // 使用用户指定的比特率
      targetBitrate = parseInt(bitrate);
    } else {
      // 使用质量预设
      switch (quality) {
        case 'high':
          targetBitrate = 2000; // 2Mbps
          break;
        case 'medium':
          targetBitrate = 1000; // 1Mbps
          break;
        case 'low':
          targetBitrate = 500; // 500kbps
          break;
        default:
          targetBitrate = 1000; // 默认1Mbps
      }
    }
    
    // 获取原始文件大小
    const originalSize = await getFileSize(videoPath);
    
    ffmpeg(videoPath)
      .output(outputPath)
      .videoCodec('libx264')
      .videoBitrate(`${targetBitrate}k`)
      .audioBitrate('128k')
      // 添加质量参数
      .addOption('-crf', targetBitrate > 1500 ? '21' : targetBitrate > 800 ? '24' : '27')
      .addOption('-preset', targetBitrate > 1500 ? 'slow' : 'medium')
      .on('start', (cmdLine) => {
        console.log(`压缩开始: ${cmdLine}`);
      })
      .on('progress', (progress) => {
        if (progress.timemark) {
          console.log(`压缩进度: ${progress.timemark}`);
        }
      })
      .on('end', async () => {
        try {
          const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
          const outputSize = await getFileSize(outputPath);
          const compressionRatio = calculateCompressionRatio(originalSize, outputSize);
          
          res.status(200).json({
            success: true,
            message: '压缩成功',
            processingTime,
            fileSize: outputSize,
            originalSize,
            compressionRatio,
            output_url: generatePublicUrl(outputPath)
          });
        } catch (error) {
          console.error('获取文件信息失败:', error);
        } finally {
          // 清理临时文件
          await cleanupTempFiles([videoPath]);
        }
      })
      .on('error', (err) => {
        handleError(res, err, videoPath, outputPath, '压缩失败');
      })
      .run();
  } catch (error) {
    handleError(res, error, req.file?.path || null, null, '处理视频压缩请求失败');
  }
});

// 视频缩放接口
router.post('/resize', upload.single('video'), async (req, res) => {
  try {
    const startTime = Date.now();
    const { width, height, maintainAspect } = req.body;
    const videoPath = req.file.path;
    const outputFilename = generateOutputFilename(req.file.originalname, 'resized', 'mp4');
    const outputPath = path.join(uploadDir, outputFilename);
    
    if (!width && !height) {
      await cleanupTempFiles([videoPath]);
      return res.status(400).json({
        success: false,
        message: '至少需要指定宽度或高度'
      });
    }
    
    // 验证分辨率
    const targetWidth = width ? parseInt(width) : null;
    const targetHeight = height ? parseInt(height) : null;
    
    if (targetWidth && !validateResolution(targetWidth, 1)) {
      await cleanupTempFiles([videoPath]);
      return res.status(400).json({
        success: false,
        message: '宽度必须在1到8192之间'
      });
    }
    
    if (targetHeight && !validateResolution(1, targetHeight)) {
      await cleanupTempFiles([videoPath]);
      return res.status(400).json({
        success: false,
        message: '高度必须在1到8192之间'
      });
    }
    
    let command = ffmpeg(videoPath)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('copy')
      .addOption('-preset', 'medium');
    
    // 设置缩放参数
    if (maintainAspect === 'true' || maintainAspect === true) {
      // 保持宽高比
      if (targetWidth) {
        command = command.size(`${targetWidth}x?`);
      } else if (targetHeight) {
        command = command.size(`?x${targetHeight}`);
      }
    } else {
      // 不保持宽高比，直接设置尺寸
      command = command.size(`${targetWidth || -1}x${targetHeight || -1}`);
    }
    
    // 自适应比特率设置
    const bitrateMultiplier = (targetWidth || targetHeight > 1080) ? '2000k' : '1500k';
    command = command.videoBitrate(bitrateMultiplier);
    
    command
      .on('start', (cmdLine) => {
        console.log(`缩放开始: ${cmdLine}`);
      })
      .on('progress', (progress) => {
        if (progress.timemark) {
          console.log(`缩放进度: ${progress.timemark}`);
        }
      })
      .on('end', async () => {
        try {
          const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
          const outputSize = await getFileSize(outputPath);
          
          // 获取输出视频的元数据
          ffmpeg.ffprobe(outputPath, (err, metadata) => {
            let metadataInfo = {};
            if (!err && metadata.streams[0]) {
              metadataInfo = {
                width: metadata.streams[0].width,
                height: metadata.streams[0].height
              };
            }
            
            res.status(200).json({
              success: true,
              message: '缩放成功',
              processingTime,
              fileSize: outputSize,
              requestedWidth: targetWidth,
              requestedHeight: targetHeight,
              actualWidth: metadataInfo.width,
              actualHeight: metadataInfo.height,
              maintainAspectRatio: maintainAspect === 'true' || maintainAspect === true,
              output_url: generatePublicUrl(outputPath)
            });
          });
        } catch (error) {
          console.error('获取文件信息失败:', error);
        } finally {
          // 清理临时文件
          await cleanupTempFiles([videoPath]);
        }
      })
      .on('error', (err) => {
        handleError(res, err, videoPath, outputPath, '缩放失败');
      })
      .run();
  } catch (error) {
    handleError(res, error, req.file?.path || null, null, '处理视频缩放请求失败');
  }
});

module.exports = router;