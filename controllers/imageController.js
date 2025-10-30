const express = require('express');
const router = express.Router();
const ffmpeg = require('../utils/ffmpegConfig');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const multer = require('multer');

// 导入工具函数
const {
    generateOutputFilename,
    calculateProgress,
    handleError,
    cleanupTempFiles,
    validateResolution,
    formatFileSize
} = require('../utils/videoUtils');

// 创建必要的目录
const uploadDir = path.join(__dirname, '../uploads');
const tempDir = path.join(__dirname, '../temp');

// 确保目录存在
const ensureDirectoryExists = (dirPath) => {
    if (!fsSync.existsSync(dirPath)) {
        fsSync.mkdirSync(dirPath, { recursive: true });
        console.log(`创建目录: ${dirPath}`);
    }
};

ensureDirectoryExists(uploadDir);
ensureDirectoryExists(tempDir);

// 配置multer用于文件上传 - 上传到uploads目录
const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, generateOutputFilename(file.originalname));
    }
});

// 配置multer用于临时文件 - 上传到temp目录
const tempStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        cb(null, generateOutputFilename(file.originalname));
    }
});

// 创建上传中间件
const upload = multer({ 
    storage: uploadStorage,
    fileFilter: (req, file, cb) => {
        // 支持常见的图像格式
        const allowedTypes = /jpeg|jpg|png|gif|webp/i;
        const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimeType = allowedTypes.test(file.mimetype);
        
        if (extName && mimeType) {
            return cb(null, true);
        } else {
            cb(new Error('只支持图像格式: JPEG, PNG, GIF, WebP'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB限制
    }
});

// 创建临时文件上传中间件
const tempUpload = multer({ 
    storage: tempStorage,
    fileFilter: (req, file, cb) => {
        // 支持常见的图像格式
        const allowedTypes = /jpeg|jpg|png|gif|webp/i;
        const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimeType = allowedTypes.test(file.mimetype);
        
        if (extName && mimeType) {
            return cb(null, true);
        } else {
            cb(new Error('只支持图像格式: JPEG, PNG, GIF, WebP'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB限制
    }
});

// 工具函数：验证颜色格式 - 增强版
const isValidColor = (color) => {
    if (!color || typeof color !== 'string') return false;
    
    // 支持颜色名称、十六进制、RGB格式
    const colorNameRegex = /^[a-zA-Z]+$/;
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const rgbRegex = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
    const rgbaRegex = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/;
    
    return colorNameRegex.test(color) || hexRegex.test(color) || rgbRegex.test(color) || rgbaRegex.test(color);
};

// 生成公开URL
const generatePublicUrl = (filename) => {
    return `/uploads/${filename}`;
};

// 抠图接口（基于色度键）- 增强版
router.post('/chromakey', tempUpload.single('image'), (req, res) => {
    const startTime = Date.now();
    const tempFiles = [req.file.path]; // 记录需要清理的临时文件
    
    try {
        const { color, colors, similarity, blend, showMask } = req.body;
        const imagePath = req.file.path;
        const outputFilename = generateOutputFilename('chromakey', 'png');
        const outputPath = path.join(uploadDir, outputFilename);
        
        // 处理多颜色或单一颜色参数
        let colorsToProcess = [];
        
        // 如果提供了colors参数（多颜色抠图）
        if (colors) {
            try {
                // 尝试解析colors参数为数组
                const parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
                if (!Array.isArray(parsedColors) || parsedColors.length === 0) {
                    cleanupTempFiles(tempFiles);
                    return res.status(400).json({
                        success: false,
                        message: '参数错误',
                        error: 'colors必须是一个非空数组'
                    });
                }
                
                // 验证每个颜色的格式
                for (const c of parsedColors) {
                    if (!isValidColor(c)) {
                        cleanupTempFiles(tempFiles);
                        return res.status(400).json({
                            success: false,
                            message: '参数错误',
                            error: `无效的颜色格式: ${c}，请使用颜色名称、十六进制、RGB或RGBA格式`
                        });
                    }
                }
                colorsToProcess = parsedColors;
            } catch (e) {
                cleanupTempFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    message: '参数错误',
                    error: 'colors参数格式错误，请提供有效的JSON数组'
                });
            }
        } 
        // 否则使用单一颜色参数
        else if (color) {
            if (!isValidColor(color)) {
                cleanupTempFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    message: '参数错误',
                    error: '无效的颜色格式，请使用颜色名称、十六进制、RGB或RGBA格式'
                });
            }
            colorsToProcess = [color];
        } 
        // 如果既没有提供color也没有提供colors
        else {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: '必须提供背景色（color）或颜色数组（colors）'
            });
        }
        
        // 转换相似度和混合参数
        const similarityValue = Math.max(0, Math.min(1, parseFloat(similarity) || 0.3));
        const blendValue = Math.max(0, Math.min(1, parseFloat(blend) || 0.2));
        
        // 构建滤镜链 - 支持多颜色
        let filterChain = '';
        
        // 为每种颜色添加chromakey滤镜
        colorsToProcess.forEach((color, index) => {
            if (index > 0) {
                filterChain += ',';
            }
            filterChain += `chromakey=${color}:${similarityValue}:${blendValue}`;
        });
        
        // 支持为每种颜色设置不同的相似度和混合参数
        // 可以通过相似名称的参数传入，如similarity_0, blend_0, similarity_1, blend_1等
        
        // 如果需要显示遮罩
        if (showMask === 'true') {
            filterChain = `${filterChain},extractplanes=a,colorchannelmixer=aa=1`;
        }
        
        console.log(`开始处理色度键抠图: ${req.file.originalname}`);
        
        // 使用FFmpeg的chromakey滤镜进行抠图
        ffmpeg(imagePath)
            .outputOptions([
                '-y', // 覆盖现有文件
                `-vf ${filterChain}`,
                '-pix_fmt rgba',
                '-compression_level 1' // PNG压缩级别，1-9，1最快
            ])
            .output(outputPath)
            .on('progress', (progress) => {
                const percentage = calculateProgress(progress.percent || 0);
                console.log(`[${req.file.originalname}] 抠图进度: ${percentage}%`);
            })
            .on('end', async () => {
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
                const fileStats = fsSync.statSync(outputPath);
                const fileSize = formatFileSize(fileStats.size);
                
                // 清理临时文件
                await cleanupTempFiles(tempFiles);
                
                console.log(`[${req.file.originalname}] 抠图完成，耗时: ${processingTime}秒`);
                
                res.status(200).json({
                    success: true,
                    message: '抠图成功',
                    output_url: generatePublicUrl(outputFilename),
                    fileSize,
                    processingTime,
                    colorsUsed: colorsToProcess,  // 返回所有处理的颜色
                    similarity: similarityValue,
                    blend: blendValue,
                    originalColorCount: colorsToProcess.length
                });
            })
            .on('error', async (err) => {
                await cleanupTempFiles(tempFiles);
                handleError(res, '抠图处理失败', err);
            })
            .run();
    } catch (error) {
        cleanupTempFiles(tempFiles);
        console.error('服务器错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

// 高级抠图接口 - 支持多种抠图方式
router.post('/advanced-keying', tempUpload.single('image'), (req, res) => {
    const startTime = Date.now();
    const tempFiles = [req.file.path]; // 记录需要清理的临时文件
    
    try {
        const { method, color, similarity, blend, threshold, softness } = req.body;
        const imagePath = req.file.path;
        const outputFilename = generateOutputFilename('advanced-keying', 'png');
        const outputPath = path.join(uploadDir, outputFilename);
        
        let filterChain = '';
        
        switch (method) {
            case 'chromakey':
                // 色度键抠图（蓝绿幕）
                if (!color) {
                    cleanupTempFiles(tempFiles);
                    return res.status(400).json({ 
                        success: false, 
                        message: '参数错误',
                        error: '色度键抠图需要指定颜色' 
                    });
                }
                if (!isValidColor(color)) {
                    cleanupTempFiles(tempFiles);
                    return res.status(400).json({ 
                        success: false, 
                        message: '参数错误',
                        error: '无效的颜色格式' 
                    });
                }
                filterChain = `chromakey=${color}:${Math.max(0, Math.min(1, parseFloat(similarity) || 0.3))}:${Math.max(0, Math.min(1, parseFloat(blend) || 0.2))}`;
                break;
                
            case 'colorkey':
                // 颜色键抠图（精确颜色）
                if (!color) {
                    cleanupTempFiles(tempFiles);
                    return res.status(400).json({ 
                        success: false, 
                        message: '参数错误',
                        error: '颜色键抠图需要指定颜色' 
                    });
                }
                if (!isValidColor(color)) {
                    cleanupTempFiles(tempFiles);
                    return res.status(400).json({ 
                        success: false, 
                        message: '参数错误',
                        error: '无效的颜色格式' 
                    });
                }
                filterChain = `colorkey=${color}:${Math.max(0, Math.min(1, parseFloat(similarity) || 0.3))}:${Math.max(0, Math.min(1, parseFloat(blend) || 0.01))}`;
                break;
                
            case 'alphakey':
                // Alpha通道抠图
                filterChain = `alphakey=${Math.max(0, Math.min(1, parseFloat(threshold) || 0.5))}:${Math.max(0, Math.min(1, parseFloat(softness) || 0.0))}`;
                break;
                
            default:
                cleanupTempFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    message: '参数错误',
                    error: '不支持的抠图方式，请使用 chromakey, colorkey 或 alphakey'
                });
        }
        
        console.log(`开始高级抠图 (${method}): ${req.file.originalname}`);
        
        ffmpeg(imagePath)
            .outputOptions([
                '-y',
                `-vf ${filterChain}`,
                '-pix_fmt rgba',
                '-compression_level 1'
            ])
            .output(outputPath)
            .on('progress', (progress) => {
                const percentage = calculateProgress(progress.percent || 0);
                console.log(`[${req.file.originalname}] 高级抠图进度: ${percentage}%`);
            })
            .on('end', async () => {
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
                const fileStats = fsSync.statSync(outputPath);
                const fileSize = formatFileSize(fileStats.size);
                
                // 清理临时文件
                await cleanupTempFiles(tempFiles);
                
                console.log(`[${req.file.originalname}] 高级抠图完成，耗时: ${processingTime}秒`);
                
                res.status(200).json({
                    success: true,
                    message: '高级抠图成功',
                    output_url: generatePublicUrl(outputFilename),
                    fileSize,
                    processingTime,
                    method: method
                });
            })
            .on('error', async (err) => {
                await cleanupTempFiles(tempFiles);
                handleError(res, '高级抠图失败', err);
            })
            .run();
    } catch (error) {
        cleanupTempFiles(tempFiles);
        console.error('服务器错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

// 图像裁剪接口
router.post('/crop', tempUpload.single('image'), (req, res) => {
    const startTime = Date.now();
    const tempFiles = [req.file.path]; // 记录需要清理的临时文件
    
    try {
        let { width, height, x = 0, y = 0 } = req.body;
        const imagePath = req.file.path;
        const outputFilename = generateOutputFilename('cropped', 'png');
        const outputPath = path.join(uploadDir, outputFilename);
        
        // 验证宽度和高度
        const widthNum = parseInt(width);
        const heightNum = parseInt(height);
        const xNum = parseInt(x);
        const yNum = parseInt(y);
        
        if (!validateDimensions(widthNum, heightNum) || widthNum <= 0 || heightNum <= 0) {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: '宽度和高度必须是正整数'
            });
        }
        
        // 确保x和y不为负数
        const safeX = Math.max(0, xNum);
        const safeY = Math.max(0, yNum);
        
        console.log(`开始图像裁剪: ${req.file.originalname}`);
        
        // 使用crop滤镜进行图像裁剪
        ffmpeg(imagePath)
            .outputOptions([
                '-y',
                `-vf crop=${widthNum}:${heightNum}:${safeX}:${safeY}`
            ])
            .output(outputPath)
            .on('progress', (progress) => {
                const percentage = calculateProgress(progress.percent || 0);
                console.log(`[${req.file.originalname}] 裁剪进度: ${percentage}%`);
            })
            .on('end', async () => {
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
                const fileStats = fsSync.statSync(outputPath);
                const fileSize = formatFileSize(fileStats.size);
                
                // 清理临时文件
                await cleanupTempFiles(tempFiles);
                
                console.log(`[${req.file.originalname}] 裁剪完成，耗时: ${processingTime}秒`);
                
                res.status(200).json({
                    success: true,
                    message: '裁剪成功',
                    output_url: generatePublicUrl(outputFilename),
                    fileSize,
                    processingTime,
                    cropDimensions: {
                        width: widthNum,
                        height: heightNum,
                        x: safeX,
                        y: safeY
                    }
                });
            })
            .on('error', async (err) => {
                await cleanupTempFiles(tempFiles);
                handleError(res, '裁剪处理失败', err);
            })
            .run();
    } catch (error) {
        cleanupTempFiles(tempFiles);
        console.error('服务器错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

// 图像缩放接口
router.post('/resize', tempUpload.single('image'), (req, res) => {
    const startTime = Date.now();
    const tempFiles = [req.file.path]; // 记录需要清理的临时文件
    
    try {
        let { width, height, maintainAspectRatio = 'true' } = req.body;
        const imagePath = req.file.path;
        const outputFilename = generateOutputFilename('resized', 'png');
        const outputPath = path.join(uploadDir, outputFilename);
        
        if (!width && !height) {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: '宽度或高度是必需的'
            });
        }
        
        // 验证宽度和高度（如果提供）
        const widthNum = width ? parseInt(width) : null;
        const heightNum = height ? parseInt(height) : null;
        
        if ((widthNum && widthNum <= 0) || (heightNum && heightNum <= 0)) {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: '宽度和高度必须是正整数'
            });
        }
        
        // 构建缩放滤镜
        let scaleFilter = '';
        if (maintainAspectRatio === 'true') {
            if (widthNum && !heightNum) {
                scaleFilter = `scale=${widthNum}:-1`;
            } else if (!widthNum && heightNum) {
                scaleFilter = `scale=-1:${heightNum}`;
            } else {
                scaleFilter = `scale=${widthNum}:${heightNum}:force_original_aspect_ratio=decrease`;
            }
        } else {
            scaleFilter = `scale=${widthNum || '-1'}:${heightNum || '-1'}`;
        }
        
        console.log(`开始图像缩放: ${req.file.originalname}`);
        
        ffmpeg(imagePath)
            .outputOptions([
                '-y',
                `-vf ${scaleFilter}`,
                '-compression_level 1'
            ])
            .output(outputPath)
            .on('progress', (progress) => {
                const percentage = calculateProgress(progress.percent || 0);
                console.log(`[${req.file.originalname}] 缩放进度: ${percentage}%`);
            })
            .on('end', async () => {
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
                const fileStats = fsSync.statSync(outputPath);
                const fileSize = formatFileSize(fileStats.size);
                
                // 获取缩放后的图像信息
                let resizedWidth = 0;
                let resizedHeight = 0;
                
                try {
                    const metadata = await new Promise((resolve, reject) => {
                        ffmpeg.ffprobe(outputPath, (err, data) => {
                            if (err) reject(err);
                            else resolve(data);
                        });
                    });
                    
                    if (metadata.streams && metadata.streams[0]) {
                        resizedWidth = metadata.streams[0].width;
                        resizedHeight = metadata.streams[0].height;
                    }
                } catch (probeErr) {
                    console.error('获取缩放后图像信息失败:', probeErr);
                }
                
                // 清理临时文件
                await cleanupTempFiles(tempFiles);
                
                console.log(`[${req.file.originalname}] 缩放完成，耗时: ${processingTime}秒`);
                
                res.status(200).json({
                    success: true,
                    message: '缩放成功',
                    output_url: generatePublicUrl(outputFilename),
                    fileSize,
                    processingTime,
                    resizedDimensions: {
                        width: resizedWidth,
                        height: resizedHeight
                    }
                });
            })
            .on('error', async (err) => {
                await cleanupTempFiles(tempFiles);
                handleError(res, '缩放处理失败', err);
            })
            .run();
    } catch (error) {
        cleanupTempFiles(tempFiles);
        console.error('服务器错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

// 图像格式转换接口
router.post('/convert', tempUpload.single('image'), (req, res) => {
    const startTime = Date.now();
    const tempFiles = [req.file.path]; // 记录需要清理的临时文件
    
    try {
        let { format } = req.body;
        const imagePath = req.file.path;
        
        // 验证格式参数
        if (!format) {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: '目标格式是必需的（如png, jpg, webp等）'
            });
        }
        
        // 规范化格式名称
        format = format.toLowerCase();
        const supportedFormats = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
        
        if (!supportedFormats.includes(format)) {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: `不支持的格式: ${format}，支持的格式有: ${supportedFormats.join(', ')}`
            });
        }
        
        const outputFilename = generateOutputFilename('converted', format);
        const outputPath = path.join(uploadDir, outputFilename);
        
        console.log(`开始图像格式转换: ${req.file.originalname} -> ${format}`);
        
        // 构建命令
        const command = ffmpeg(imagePath)
            .outputOptions([
                '-y'
            ]);
        
        // 根据目标格式设置优化参数
        switch (format) {
            case 'jpg':
            case 'jpeg':
                command.outputOptions([
                    '-q:v 8' // JPEG质量，1-31，8为较高质量
                ]);
                break;
            case 'png':
                command.outputOptions([
                    '-compression_level 3' // PNG压缩级别，1-9，3为折中选项
                ]);
                break;
            case 'webp':
                command.outputOptions([
                    '-q:v 80' // WebP质量，0-100
                ]);
                break;
        }
        
        command
            .output(outputPath)
            .on('progress', (progress) => {
                const percentage = calculateProgress(progress.percent || 0);
                console.log(`[${req.file.originalname}] 格式转换进度: ${percentage}%`);
            })
            .on('end', async () => {
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
                const fileStats = fsSync.statSync(outputPath);
                const fileSize = formatFileSize(fileStats.size);
                
                // 清理临时文件
                await cleanupTempFiles(tempFiles);
                
                console.log(`[${req.file.originalname}] 格式转换完成，耗时: ${processingTime}秒`);
                
                res.status(200).json({
                    success: true,
                    message: '格式转换成功',
                    output_url: generatePublicUrl(outputFilename),
                    fileSize,
                    processingTime,
                    targetFormat: format
                });
            })
            .on('error', async (err) => {
                await cleanupTempFiles(tempFiles);
                handleError(res, '格式转换失败', err);
            })
            .run();
    } catch (error) {
        cleanupTempFiles(tempFiles);
        console.error('服务器错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

// 图像合成接口（支持透明合成）
router.post('/overlay', tempUpload.fields([{ name: 'baseImage' }, { name: 'overlayImage' }]), (req, res) => {
    const startTime = Date.now();
    const tempFiles = []; // 记录需要清理的临时文件
    
    try {
        const { x = 0, y = 0, alpha, blendMode } = req.body;
        
        // 确保文件已上传
        if (!req.files || !req.files.baseImage || !req.files.overlayImage) {
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: '请上传基础图像和叠加图像'
            });
        }
        
        const baseImagePath = req.files.baseImage[0].path;
        const overlayImagePath = req.files.overlayImage[0].path;
        
        // 添加到临时文件列表
        tempFiles.push(baseImagePath, overlayImagePath);
        
        const outputFilename = generateOutputFilename('overlay', 'png');
        const outputPath = path.join(uploadDir, outputFilename);
        
        let filterChain = '';
        
        // 验证alpha参数
        const alphaValue = alpha ? Math.max(0, Math.min(1, parseFloat(alpha))) : null;
        
        // 支持的混合模式
        const supportedBlendModes = ['normal', 'addition', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
        const safeBlendMode = blendMode && supportedBlendModes.includes(blendMode) ? blendMode : 'normal';
        
        if (safeBlendMode !== 'normal') {
            // 使用blend滤镜支持多种混合模式
            filterChain = `[0][1]blend=${safeBlendMode}${alphaValue !== null ? `:all_opacity=${alphaValue}` : ''}`;
        } else {
            // 标准overlay，支持alpha
            let overlayFilter = `overlay=${parseInt(x)}:${parseInt(y)}`;
            if (alphaValue !== null) {
                // 如果指定了透明度，先调整overlay图像的alpha
                filterChain = `[1]format=rgba,colorchannelmixer=aa=${alphaValue}[overlay];[0][overlay]${overlayFilter}`;
            } else {
                filterChain = overlayFilter;
            }
        }
        
        console.log(`开始图像合成: ${req.files.baseImage[0].originalname} + ${req.files.overlayImage[0].originalname}`);
        
        ffmpeg(baseImagePath)
            .input(overlayImagePath)
            .outputOptions([
                '-y',
                `-filter_complex ${filterChain}`,
                '-pix_fmt rgba',
                '-compression_level 1'
            ])
            .output(outputPath)
            .on('progress', (progress) => {
                const percentage = calculateProgress(progress.percent || 0);
                console.log(`图像合成进度: ${percentage}%`);
            })
            .on('end', async () => {
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
                const fileStats = fsSync.statSync(outputPath);
                const fileSize = formatFileSize(fileStats.size);
                
                // 清理临时文件
                await cleanupTempFiles(tempFiles);
                
                console.log(`图像合成完成，耗时: ${processingTime}秒`);
                
                res.status(200).json({
                    success: true,
                    message: '图像合成成功',
                    output_url: generatePublicUrl(outputFilename),
                    fileSize,
                    processingTime,
                    blendMode: safeBlendMode,
                    alpha: alphaValue !== null ? alphaValue : 1.0,
                    position: { x: parseInt(x), y: parseInt(y) }
                });
            })
            .on('error', async (err) => {
                await cleanupTempFiles(tempFiles);
                handleError(res, '图像合成失败', err);
            })
            .run();
    } catch (error) {
        cleanupTempFiles(tempFiles);
        console.error('服务器错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

// 批量图像合成为透明GIF接口
router.post('/images-to-transparent-gif', tempUpload.array('images'), async (req, res) => {
    const startTime = Date.now();
    let tempDir = null;
    
    try {
        const { fps, loop, optimize = 'true' } = req.body;
        
        // 验证是否上传了图片
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: '请上传至少一张图片'
            });
        }
        
        // 限制文件数量
        if (req.files.length > 100) {
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: '一次最多支持100张图片'
            });
        }
        
        // 创建临时目录存放排序后的图片
        tempDir = path.join(tempDir, `${Date.now()}-sorted`);
        if (!fsSync.existsSync(tempDir)) {
            fsSync.mkdirSync(tempDir, { recursive: true });
        }
        
        const uploadedTempFiles = req.files.map(file => file.path);
        
        // 排序并复制图片到临时目录
        req.files.sort((a, b) => a.originalname.localeCompare(b.originalname));
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const newPath = path.join(tempDir, `img_${i.toString().padStart(4, '0')}${path.extname(file.originalname)}`);
            fsSync.copyFileSync(file.path, newPath);
        }
        
        const inputPattern = path.join(tempDir, 'img_%04d.*');
        const outputFilename = generateOutputFilename('transparent-gif', 'gif');
        const outputPath = path.join(uploadDir, outputFilename);
        
        // 验证FPS和循环参数
        const fpsValue = Math.max(1, Math.min(60, parseInt(fps) || 10)); // 限制在1-60之间
        const loopValue = loop !== undefined ? parseInt(loop) : 0; // 0表示无限循环
        
        console.log(`开始创建透明GIF，共${req.files.length}张图片，FPS: ${fpsValue}`);
        
        // 构建FFmpeg命令
        let command;
        
        if (optimize === 'true') {
            // 高级优化：使用palettegen和paletteuse提高质量和减少大小
            command = ffmpeg()
                .input(inputPattern)
                .inputOptions(['-f image2'])
                .outputOptions([
                    `-framerate ${fpsValue}`,
                    `-filter_complex "split[s0][s1];[s0]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[s1][p]paletteuse=alpha_threshold=128"`,
                    `-loop ${loopValue}`,
                    `-gifflags +transdiff`,
                    `-pix_fmt rgba`
                ])
                .output(outputPath);
        } else {
            // 基本转换
            command = ffmpeg(inputPattern)
                .inputOptions(['-f image2'])
                .outputOptions([
                    `-framerate ${fpsValue}`,
                    `-loop ${loopValue}`,
                    `-pix_fmt rgba`
                ])
                .output(outputPath);
        }
        
        command
            .on('progress', (progress) => {
                const percentage = calculateProgress(progress.percent || 0);
                console.log(`GIF创建进度: ${percentage}%`);
            })
            .on('end', async () => {
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
                
                try {
                    // 清理临时文件
                    await cleanupTempFiles(uploadedTempFiles);
                    
                    // 清理临时目录
                    if (fsSync.existsSync(tempDir)) {
                        const files = await fs.readdir(tempDir);
                        for (const file of files) {
                            await fs.unlink(path.join(tempDir, file));
                        }
                        await fs.rmdir(tempDir);
                    }
                    
                    // 获取GIF文件信息
                    const fileStats = fsSync.statSync(outputPath);
                    const fileSize = formatFileSize(fileStats.size);
                    
                    console.log(`透明GIF创建完成，耗时: ${processingTime}秒，大小: ${fileSize}`);
                    
                    res.status(200).json({
                        success: true,
                        message: '透明GIF创建成功',
                        output_url: generatePublicUrl(outputFilename),
                        fileSize,
                        processingTime,
                        frameCount: req.files.length,
                        fps: fpsValue,
                        loop: loopValue
                    });
                } catch (cleanupError) {
                    console.error('清理临时文件失败:', cleanupError);
                    // 即使清理失败，仍然返回成功响应
                    res.status(200).json({
                        success: true,
                        message: '透明GIF创建成功（临时文件清理失败）',
                        output_url: generatePublicUrl(outputFilename),
                        frameCount: req.files.length,
                        fps: fpsValue,
                        loop: loopValue
                    });
                }
            })
            .on('error', async (err) => {
                console.error('GIF创建错误:', err);
                // 尝试清理临时文件
                try {
                    await cleanupTempFiles(uploadedTempFiles);
                    
                    if (tempDir && fsSync.existsSync(tempDir)) {
                        const files = await fs.readdir(tempDir);
                        for (const file of files) {
                            await fs.unlink(path.join(tempDir, file));
                        }
                        await fs.rmdir(tempDir);
                    }
                } catch (cleanupError) {
                    console.error('清理临时文件失败:', cleanupError);
                }
                
                handleError(res, '透明GIF创建失败', err);
            })
            .run();
    } catch (error) {
        // 尝试清理临时文件
        try {
            if (tempDir && fsSync.existsSync(tempDir)) {
                const files = await fs.readdir(tempDir);
                for (const file of files) {
                    await fs.unlink(path.join(tempDir, file));
                }
                await fs.rmdir(tempDir);
            }
        } catch (cleanupError) {
            console.error('清理临时文件失败:', cleanupError);
        }
        
        console.error('服务器错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

// 抠图并直接生成透明GIF接口
router.post('/chromakey-to-gif', tempUpload.single('image'), async (req, res) => {
    const startTime = Date.now();
    const tempFiles = [req.file.path]; // 记录需要清理的临时文件
    let tempDir = null;
    
    try {
        const { color, similarity, blend, fps, loop, optimize = 'true' } = req.body;
        const imagePath = req.file.path;
        
        // 验证颜色参数
        if (!color) {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: '背景色是必需的（如green, blue等）'
            });
        }
        
        // 验证颜色格式
        if (!isValidColor(color)) {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                message: '参数错误',
                error: '无效的颜色格式，请使用颜色名称、十六进制、RGB或RGBA格式'
            });
        }
        
        // 创建临时目录
        tempDir = path.join(tempDir, `${Date.now()}-keying`);
        if (!fsSync.existsSync(tempDir)) {
            fsSync.mkdirSync(tempDir, { recursive: true });
        }
        
        const keyedImagePath = path.join(tempDir, 'keyed.png');
        tempFiles.push(keyedImagePath);
        
        const outputFilename = generateOutputFilename('chromakey-gif', 'gif');
        const outputPath = path.join(uploadDir, outputFilename);
        
        // 设置抠图参数
        const similarityValue = Math.max(0, Math.min(1, parseFloat(similarity) || 0.3));
        const blendValue = Math.max(0, Math.min(1, parseFloat(blend) || 0.2));
        const fpsValue = Math.max(1, Math.min(30, parseInt(fps) || 1)); // 单帧GIF使用低帧率
        const loopValue = loop !== undefined ? parseInt(loop) : 0; // 0表示无限循环
        
        console.log(`开始抠图并生成透明GIF: ${req.file.originalname}`);
        
        // 第一步：抠图
        await new Promise((resolve, reject) => {
            ffmpeg(imagePath)
                .outputOptions([
                    '-y',
                    `-vf chromakey=${color}:${similarityValue}:${blendValue}`,
                    '-pix_fmt rgba',
                    '-compression_level 1'
                ])
                .output(keyedImagePath)
                .on('progress', (progress) => {
                    console.log(`抠图进度: ${progress.percent || 0}%`);
                })
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        
        // 创建一个简单的GIF（单帧循环，可用于展示抠图结果）
        let command;
        
        if (optimize === 'true') {
            // 优化版本
            command = ffmpeg(keyedImagePath)
                .outputOptions([
                    `-loop ${loopValue}`,
                    `-filter_complex "split[s0][s1];[s0]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[s1][p]paletteuse=alpha_threshold=128"`,
                    `-framerate ${fpsValue}`,
                    `-gifflags +transdiff`,
                    `-pix_fmt rgba`
                ])
                .output(outputPath);
        } else {
            // 基本版本
            command = ffmpeg(keyedImagePath)
                .outputOptions([
                    `-loop ${loopValue}`,
                    `-framerate ${fpsValue}`,
                    `-pix_fmt rgba`
                ])
                .output(outputPath);
        }
        
        command
            .on('progress', (progress) => {
                const percentage = calculateProgress(progress.percent || 0);
                console.log(`GIF生成进度: ${percentage}%`);
            })
            .on('end', async () => {
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
                
                try {
                    // 清理临时文件和目录
                    await cleanupTempFiles(tempFiles);
                    
                    if (tempDir && fsSync.existsSync(tempDir)) {
                        await fs.rmdir(tempDir);
                    }
                    
                    // 获取文件信息
                    const fileStats = fsSync.statSync(outputPath);
                    const fileSize = formatFileSize(fileStats.size);
                    
                    console.log(`抠图并生成透明GIF完成，耗时: ${processingTime}秒`);
                    
                    res.status(200).json({
                        success: true,
                        message: '抠图并生成透明GIF成功',
                        output_url: generatePublicUrl(outputFilename),
                        fileSize,
                        processingTime,
                        colorUsed: color,
                        similarity: similarityValue,
                        blend: blendValue,
                        fps: fpsValue,
                        loop: loopValue
                    });
                } catch (cleanupError) {
                    console.error('清理临时文件失败:', cleanupError);
                    res.status(200).json({
                        success: true,
                        message: '抠图并生成透明GIF成功（临时文件清理失败）',
                        output_url: generatePublicUrl(outputFilename),
                        colorUsed: color,
                        similarity: similarityValue,
                        blend: blendValue
                    });
                }
            })
            .on('error', async (err) => {
                console.error('GIF生成错误:', err);
                // 尝试清理临时文件
                try {
                    await cleanupTempFiles(tempFiles);
                    
                    if (tempDir && fsSync.existsSync(tempDir)) {
                        await fs.rmdir(tempDir);
                    }
                } catch (cleanupError) {
                    console.error('清理临时文件失败:', cleanupError);
                }
                
                handleError(res, '生成透明GIF失败', err);
            })
            .run();
    } catch (error) {
        // 清理临时文件
        cleanupTempFiles(tempFiles);
        
        if (tempDir && fsSync.existsSync(tempDir)) {
            try {
                await fs.rmdir(tempDir);
            } catch (cleanupError) {
                console.error('清理临时目录失败:', cleanupError);
            }
        }
        
        console.error('服务器错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

// 图像信息获取接口
router.post('/info', tempUpload.single('image'), (req, res) => {
    const startTime = Date.now();
    const tempFiles = [req.file.path]; // 记录需要清理的临时文件
    
    try {
        const imagePath = req.file.path;
        
        console.log(`获取图像信息: ${req.file.originalname}`);
        
        ffmpeg.ffprobe(imagePath, async (err, metadata) => {
            try {
                // 清理临时文件
                await cleanupTempFiles(tempFiles);
                
                if (err) {
                    console.error('获取图像信息失败:', err);
                    return res.status(500).json({
                        success: false,
                        message: '获取图像信息失败',
                        error: err.message
                    });
                }
                
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
                
                // 提取并格式化关键信息
                const imageStream = metadata.streams.find(stream => stream.codec_type === 'video');
                const imageInfo = {
                    success: true,
                    message: '获取图像信息成功',
                    processingTime,
                    filename: req.file.originalname,
                    fileSize: formatFileSize(metadata.format.size),
                    format: metadata.format.format_name,
                    mimeType: req.file.mimetype,
                    duration: metadata.format.duration ? parseFloat(metadata.format.duration).toFixed(2) + 's' : 'N/A'
                };
                
                // 添加图像特定信息
                if (imageStream) {
                    imageInfo.dimensions = {
                        width: imageStream.width,
                        height: imageStream.height,
                        aspectRatio: imageStream.display_aspect_ratio || (imageStream.width / imageStream.height).toFixed(2),
                        pixelFormat: imageStream.pix_fmt
                    };
                    
                    // 添加色彩信息
                    if (imageStream.color_space) {
                        imageInfo.color = {
                            space: imageStream.color_space,
                            transfer: imageStream.color_transfer,
                            primaries: imageStream.color_primaries
                        };
                    }
                }
                
                console.log(`图像信息获取完成，耗时: ${processingTime}秒`);
                
                res.status(200).json(imageInfo);
            } catch (cleanupError) {
                console.error('清理临时文件失败:', cleanupError);
                // 即使清理失败，仍然返回信息
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: '获取图像信息失败',
                        error: err.message
                    });
                }
                
                // 提取简化信息
                const imageStream = metadata.streams.find(stream => stream.codec_type === 'video');
                res.status(200).json({
                    success: true,
                    message: '获取图像信息成功（临时文件清理失败）',
                    filename: req.file.originalname,
                    dimensions: imageStream ? {
                        width: imageStream.width,
                        height: imageStream.height
                    } : undefined
                });
            }
        });
    } catch (error) {
        // 确保清理临时文件
        cleanupTempFiles(tempFiles);
        
        console.error('服务器错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

module.exports = router;