// 导入必要的模块
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

// 配置FFmpeg路径
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath('D:\\dev\\dev\\ffmpeg\\bin\\ffmpeg.exe');
ffmpeg.setFfprobePath('D:\\dev\\dev\\ffmpeg\\bin\\ffprobe.exe');


// 导入控制器
const videoController = require('./controllers/videoController');
const imageController = require('./controllers/imageController');
const gifController = require('./controllers/gifController');

// 导入工具函数
const { scheduleCleanup, formatBytes, getDirectorySize } = require('./utils/cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

// 配置安全中间件
app.use(helmet({ 
  contentSecurityPolicy: false, // 允许必要的内容加载
  xPoweredBy: false // 隐藏服务器信息
}));

// 中间件 - 增强的CORS配置
const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// 请求日志
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// 解析请求体
app.use(express.json({
    limit: '100mb' // 增加JSON解析限制，支持大型文件处理
}));
app.use(express.urlencoded({ extended: true }));

// 设置请求速率限制
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每IP限制100个请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: '请求过于频繁，请稍后再试' }
});

// 应用速率限制到API路由
app.use('/api/', apiLimiter);

// 工具函数：确保目录存在
const ensureDirectoryExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`创建目录: ${dirPath}`);
    }
};

// 确保必要的目录存在 - 扩展支持缓存目录
const uploadsDir = path.join(__dirname, 'uploads');
const tempDir = path.join(__dirname, 'temp');
const imageCacheDir = path.join(__dirname, 'cache', 'images');
const gifCacheDir = path.join(__dirname, 'cache', 'gifs');

ensureDirectoryExists(uploadsDir);
ensureDirectoryExists(tempDir);
ensureDirectoryExists(imageCacheDir);
ensureDirectoryExists(gifCacheDir);

// 设置较长的请求超时时间，适合处理大型GIF文件
app.use((req, res, next) => {
    req.setTimeout(300000); // 5分钟超时
    res.setTimeout(300000);
    next();
});

// API路由分组
app.use('/api/video', videoController);
app.use('/api/image', imageController);
app.use('/api/gif', gifController);

// 健康检查接口 - 增强版，添加视频处理统计
app.get('/health', async (req, res) => {
    try {
        // 统计上传目录中的文件类型
        const getFileTypeStats = (dir) => {
            try {
                const files = fs.readdirSync(dir);
                const stats = {
                    total: files.length,
                    video: 0,
                    image: 0,
                    gif: 0,
                    other: 0
                };
                
                files.forEach(file => {
                    const ext = path.extname(file).toLowerCase();
                    if (['.mp4', '.avi', '.mov', '.webm', '.flv', '.mkv'].includes(ext)) {
                        stats.video++;
                    } else if (['.jpg', '.jpeg', '.png', '.webp', '.bmp'].includes(ext)) {
                        stats.image++;
                    } else if (ext === '.gif') {
                        stats.gif++;
                    } else {
                        stats.other++;
                    }
                });
                return stats;
            } catch (err) {
                console.error('获取文件统计失败:', err);
                return { total: 0, video: 0, image: 0, gif: 0, other: 0 };
            }
        };
        
        const fileStats = getFileTypeStats(uploadsDir);
        
        const stats = {
            uploadsDirSize: formatBytes(getDirectorySize(uploadsDir)),
            tempDirSize: formatBytes(getDirectorySize(tempDir)),
            freeSpace: formatBytes(getFreeSpace(__dirname)),
            fileStats,
            timestamp: new Date().toISOString(),
            serverInfo: {
                nodeVersion: process.version,
                memoryUsage: formatBytes(process.memoryUsage().heapUsed),
                uptime: `${process.uptime()} 秒`
            }
        };
        
        res.status(200).json({
            success: true,
            message: '多媒体处理API服务运行中',
            version: '1.3.0',
            features: {
                imageProcessing: {
                    enabled: true,
                    endpoints: ['/api/image/chromaKey', '/api/image/advancedRemoveBg', '/api/image/resize']
                },
                transparentGifSupport: {
                    enabled: true,
                    endpoints: ['/api/gif/transparent', '/api/gif/optimize', '/api/gif/videoToGif']
                },
                videoProcessing: {
                    enabled: true,
                    endpoints: ['/api/video/info', '/api/video/convert', '/api/video/trim', '/api/video/compress', '/api/video/resize']
                },
                batchProcessing: {
                    enabled: true,
                    maxBatchSize: 10
                },
                system: {
                    endpoints: ['/health', '/batch'],
                    scheduledTasks: 'active'
                }
            },
            stats
        });
    } catch (error) {
        console.error('健康检查失败:', error);
        res.status(500).json({
            success: false,
            message: '健康检查失败',
            details: error.message
        });
    }
});

// 404处理
// 静态文件服务，用于访问处理后的文件
app.use('/uploads', express.static(uploadsDir));

// 静态文件服务，用于提供前端界面
app.use('/', express.static(path.join(__dirname, 'frontend')));

// 404 错误处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: '请求的API端点不存在',
        path: req.originalUrl
    });
});

// 错误处理中间件 - 增强版
app.use((err, req, res, next) => {
    // 详细的错误日志记录
    console.error(`[${new Date().toISOString()}] API错误 - ${req.method} ${req.path}`);
    console.error('请求参数:', req.body);
    console.error('错误详情:', err);
    
    // 处理文件上传相关错误
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            message: '文件大小超过限制',
            details: '请上传更小的文件'
        });
    }
    
    // 处理参数验证错误
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: '参数验证失败',
            details: err.message
        });
    }
    
    // 处理参数验证错误
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            message: '请求体格式错误',
            details: '无效的JSON格式'
        });
    }
    
    // 通用错误响应
    res.status(500).json({
        success: false,
        message: '服务器内部错误',
        details: process.env.NODE_ENV === 'production' ? '内部服务器错误' : err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// 辅助函数
function getFreeSpace(directory) {
    try {
        const stats = fs.statfsSync(directory);
        return stats.f_bavail * stats.f_frsize;
    } catch (error) {
        console.error('获取磁盘空间失败:', error);
        return 0;
    }
}

// 启动文件清理调度
console.log('启动文件清理调度...');
const cleanupTask = scheduleCleanup({
    tempDir: tempDir,
    cacheDir: path.join(__dirname, 'cache'),
    intervalMs: 3600000, // 每小时清理一次
    maxAgeMs: 7200000 // 文件保留2小时
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`==========================================`);
    console.log(`多媒体处理API服务已启动`);
    console.log(`端口: ${PORT}`);
    console.log(`健康检查: http://localhost:${PORT}/health`);
    console.log(`API基础路径: http://localhost:${PORT}/api`);
    console.log(`==========================================`);
    console.log(`支持的功能:`);
    console.log(`==========================================`);
    console.log(`📷 图像处理功能:`);
    console.log(`   ✅ 色度键抠图`);
    console.log(`   ✅ 高级背景移除`);
    console.log(`   ✅ 图像缩放和裁剪`);
    console.log(`==========================================`);
    console.log(`🎞️ GIF处理功能:`);
    console.log(`   ✅ 创建透明GIF`);
    console.log(`   ✅ GIF优化和压缩`);
    console.log(`   ✅ 视频转GIF`);
    console.log(`==========================================`);
    console.log(`🎬 视频处理功能:`);
    console.log(`   ✅ 视频信息获取`);
    console.log(`   ✅ 视频格式转换`);
    console.log(`   ✅ 视频剪切和裁剪`);
    console.log(`   ✅ 视频压缩优化`);
    console.log(`   ✅ 视频缩放和调整尺寸`);
    console.log(`==========================================`);
    console.log(`🔄 系统功能:`);
    console.log(`   ✅ 批量处理支持`);
    console.log(`   ✅ 自动文件清理`);
    console.log(`   ✅ 详细的错误处理`);
    console.log(`   ✅ 实时处理进度`);
    console.log(`   ✅ 请求速率限制`);
    console.log(`==========================================`);
});

// 优雅关闭处理
process.on('SIGTERM', () => {
    console.log('收到关闭信号，正在关闭服务器...');
    cleanupTask.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('收到中断信号，正在关闭服务器...');
    cleanupTask.stop();
    process.exit(0);
});

// 在进程退出时停止清理任务
process.on('exit', () => {
    if (cleanupTask && typeof cleanupTask.stop === 'function') {
        cleanupTask.stop();
    }
});

module.exports = app;