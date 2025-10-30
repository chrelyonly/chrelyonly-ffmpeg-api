const express = require('express');
const router = express.Router();
const ffmpeg = require('../utils/ffmpegConfig');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// 导入工具函数
const {
    generateOutputFilename,
    cleanupDir,
    handleError,
    ensureDirectoryExists,
    formatDuration,
    validateFileExtension,
    logProgress,
    getFileSize,
    removeTempFile,
    createTempDirectory
} = require('../utils/videoUtils');

// 配置临时文件上传
const tempStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const tempDir = path.join(__dirname, '../temp');
        ensureDirectoryExists(tempDir);
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// 上传中间件配置
const upload = multer({
    storage: tempStorage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB限制
    },
    fileFilter: function (req, file, cb) {
        // 支持的文件类型
        const allowedTypes = /gif|mp4|avi|mov|webm/i;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('只支持GIF和视频格式: GIF, MP4, AVI, MOV, WebM'));
    }
});

// 确保上传目录存在
const uploadsDir = path.join(__dirname, '../uploads');
ensureDirectoryExists(uploadsDir);

// GIF分解为图片序列 - 增强版
router.post('/explode', upload.single('gif'), async (req, res) => {
    let tempDir = null;
    const startTime = Date.now();
    
    try {
        // 验证文件扩展名
        validateFileExtension(req.file.originalname, ['.gif']);
        
        const { format, preserveAlpha } = req.body;
        const gifPath = req.file.path;
        const outputFormat = format || 'png';
        
        // 创建临时目录
        tempDir = createTempDirectory('gif-frames');
        
        // 准备输出路径模式
        const outputPattern = path.join(tempDir, 'frame-%05d.' + outputFormat);
        
        // 构建FFmpeg命令
        let command = ffmpeg(gifPath)
            .output(outputPattern)
            .outputOptions([
                `-vsync 0`, // 确保每个帧都被保留
                `-f image2`
            ]);
        
        // 如果需要保留Alpha通道
        if (preserveAlpha === 'true' && outputFormat === 'png') {
            command = command.outputOptions([
                `-pix_fmt rgba`
            ]);
        }
        
        command
            .on('progress', (progress) => {
                logProgress('GIF分解', progress.percent);
            })
            .on('end', async () => {
                try {
                    // 获取生成的帧数量
                    const frames = fs.readdirSync(tempDir);
                    const frameCount = frames.length;
                    
                    const processingTime = (Date.now() - startTime) / 1000;
                    
                    res.status(200).json({
                        success: true,
                        message: 'GIF分解成功',
                        frameCount,
                        tempDir,
                        outputFormat,
                        preserveAlpha: preserveAlpha === 'true',
                        processingTime,
                        instruction: '请从临时目录获取帧文件，生产环境应实现ZIP打包下载'
                    });
                } catch (error) {
                    handleError(res, '处理分解结果失败', error);
                } finally {
                    // 注意：临时目录需要保留，因为包含了分解的帧文件
                    removeTempFile(gifPath).catch(console.error);
                }
            })
            .on('error', async (err) => {
                console.error('GIF分解错误:', err);
                // 清理临时资源
                if (tempDir) await cleanupDir(tempDir).catch(console.error);
                removeTempFile(gifPath).catch(console.error);
                
                handleError(res, 'GIF分解失败', err);
            })
            .run();
    } catch (error) {
        // 清理临时资源
        if (tempDir) await cleanupDir(tempDir).catch(console.error);
        if (req.file?.path) removeTempFile(req.file.path).catch(console.error);
        
        handleError(res, '服务器错误', error);
    }
});

// 图片序列合成为透明GIF - 增强版
router.post('/create', upload.array('images'), async (req, res) => {
    try {
        const { fps, loop, optimize, colorCount, transparencyThreshold } = req.body;
        const outputPath = path.join(__dirname, '../uploads', `${Date.now()}-output.gif`);
        
        // 验证是否上传了图片
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: '请上传至少一张图片'
            });
        }
        
        // 创建临时目录存放排序后的图片
        const tempDir = path.join(__dirname, '../temp', `${Date.now()}-sorted`);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // 排序并复制图片到临时目录
        req.files.sort((a, b) => a.originalname.localeCompare(b.originalname));
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const newPath = path.join(tempDir, `img_${i.toString().padStart(4, '0')}${path.extname(file.originalname)}`);
            fs.copyFileSync(file.path, newPath);
        }
        
        const inputPattern = path.join(tempDir, 'img_%04d.*');
        const palettePath = path.join(tempDir, 'palette.png');
        
        // 构建FFmpeg命令
        let command;
        
        if (optimize === 'true') {
            // 高级优化：使用palettegen和paletteuse提高质量和减少大小
            // 特别优化了透明度处理
            command = ffmpeg()
                .input(inputPattern)
                .inputOptions(['-f image2'])
                .outputOptions([
                    `-framerate ${parseInt(fps) || 10}`,
                    `-filter_complex "split[s0][s1];[s0]palettegen=reserve_transparent=on:transparency_color=ffffff:max_colors=${parseInt(colorCount) || 256}[p];[s1][p]paletteuse=alpha_threshold=${parseInt(transparencyThreshold) || 128}:dither=sierra2_4a"`,
                    `-loop ${parseInt(loop) || 0}`,
                    `-gifflags +transdiff`,
                    `-compression_level 3`, // 优化压缩级别
                    `-pix_fmt rgb24`
                ])
                .output(outputPath);
        } else {
            // 基本转换
            command = ffmpeg(inputPattern)
                .inputOptions(['-f image2'])
                .outputOptions([
                    `-framerate ${parseInt(fps) || 10}`,
                    `-loop ${parseInt(loop) || 0}`,
                    `-pix_fmt rgb24`
                ])
                .output(outputPath);
        }
        
        command
            .on('progress', (progress) => {
                console.log(`GIF创建进度: ${progress.percent}%`);
            })
            .on('end', async () => {
                try {
                    // 清理临时文件
                    await cleanupDir(tempDir);
                    
                    // 获取GIF文件信息
                    ffmpeg.ffprobe(outputPath, (err, metadata) => {
                        const fileSize = metadata?.format?.size || 0;
                        
                        res.status(200).json({
                            message: 'GIF创建成功',
                            outputPath: `/uploads/${path.basename(outputPath)}`,
                            frameCount: req.files.length,
                            fps: parseInt(fps) || 10,
                            loop: parseInt(loop) || 0,
                            optimize: optimize === 'true',
                            fileSize,
                            fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2)
                        });
                    });
                } catch (cleanupError) {
                    console.error('清理临时文件失败:', cleanupError);
                    res.status(200).json({
                        message: 'GIF创建成功（临时文件清理失败）',
                        outputPath: `/uploads/${path.basename(outputPath)}`
                    });
                }
            })
            .on('error', async (err) => {
                console.error('GIF创建错误:', err);
                // 尝试清理临时文件
                await cleanupDir(tempDir).catch(console.error);
                
                res.status(500).json({
                    error: 'GIF创建失败',
                    details: err.message
                });
            })
            .run();
    } catch (error) {
        console.error('服务器错误:', error);
        res.status(500).json({
            error: '服务器错误',
            details: error.message
        });
    }
});

// GIF裁剪
router.post('/crop', upload.single('gif'), async (req, res) => {
    const startTime = Date.now();
    
    try {
        // 验证文件扩展名
        validateFileExtension(req.file.originalname, ['.gif']);
        
        const { width, height, x, y } = req.body;
        const gifPath = req.file.path;
        
        // 验证参数
        if (!width || !height) {
            return res.status(400).json({
                success: false,
                error: '宽度和高度是必需的'
            });
        }
        
        // 验证参数格式
        const parsedWidth = parseInt(width);
        const parsedHeight = parseInt(height);
        const parsedX = parseInt(x) || 0;
        const parsedY = parseInt(y) || 0;
        
        if (isNaN(parsedWidth) || isNaN(parsedHeight) || parsedWidth <= 0 || parsedHeight <= 0) {
            return res.status(400).json({
                success: false,
                error: '宽度和高度必须是有效的正整数'
            });
        }
        
        const outputPath = path.join(uploadsDir, generateOutputFilename('cropped.gif'));
        
        ffmpeg(gifPath)
            .output(outputPath)
            .outputOptions([
                `-vf crop=${parsedWidth}:${parsedHeight}:${parsedX}:${parsedY}`,
                '-pix_fmt rgb24',
                '-f gif'
            ])
            .on('progress', (progress) => {
                logProgress('GIF裁剪', progress.percent);
            })
            .on('end', async () => {
                try {
                    const fileSize = getFileSize(outputPath);
                    const processingTime = (Date.now() - startTime) / 1000;
                    
                    res.status(200).json({
                        success: true,
                        message: 'GIF裁剪成功',
                        outputPath: `/uploads/${path.basename(outputPath)}`,
                        width: parsedWidth,
                        height: parsedHeight,
                        x: parsedX,
                        y: parsedY,
                        fileSize,
                        fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
                        processingTime
                    });
                } catch (error) {
                    handleError(res, '处理裁剪结果失败', error);
                } finally {
                    // 清理临时文件
                    removeTempFile(gifPath).catch(console.error);
                }
            })
            .on('error', async (err) => {
                console.error('GIF裁剪错误:', err);
                // 清理临时文件
                removeTempFile(gifPath).catch(console.error);
                
                handleError(res, 'GIF裁剪失败', err);
            })
            .run();
    } catch (error) {
        // 清理临时文件
        if (req.file?.path) removeTempFile(req.file.path).catch(console.error);
        
        handleError(res, '服务器错误', error);
    }
});

// GIF缩放
router.post('/resize', upload.single('gif'), async (req, res) => {
    const startTime = Date.now();
    
    try {
        // 验证文件扩展名
        validateFileExtension(req.file.originalname, ['.gif']);
        
        const { width, height, maintainAspectRatio } = req.body;
        const gifPath = req.file.path;
        
        // 验证参数
        if (!width && !height) {
            return res.status(400).json({
                success: false,
                error: '宽度或高度是必需的'
            });
        }
        
        // 构建缩放滤镜
        let scaleFilter = '';
        if (maintainAspectRatio === 'true') {
            if (width && !height) {
                scaleFilter = `scale=${width}:-1`;
            } else if (!width && height) {
                scaleFilter = `scale=-1:${height}`;
            } else {
                scaleFilter = `scale=${width}:${height}`;
            }
        } else {
            scaleFilter = `scale=${width || '-1'}:${height || '-1'}:force_original_aspect_ratio=decrease`;
        }
        
        const outputPath = path.join(uploadsDir, generateOutputFilename('resized.gif'));
        
        ffmpeg(gifPath)
            .output(outputPath)
            .outputOptions([
                `-vf ${scaleFilter}`,
                '-pix_fmt rgb24',
                '-f gif'
            ])
            .on('progress', (progress) => {
                logProgress('GIF缩放', progress.percent);
            })
            .on('end', async () => {
                try {
                    const fileSize = getFileSize(outputPath);
                    const processingTime = (Date.now() - startTime) / 1000;
                    
                    // 获取调整后的GIF信息
                    ffmpeg.ffprobe(outputPath, (err, metadata) => {
                        const videoStream = metadata?.streams?.find(s => s.codec_type === 'video');
                        const newWidth = videoStream?.width;
                        const newHeight = videoStream?.height;
                        
                        res.status(200).json({
                            success: true,
                            message: 'GIF缩放成功',
                            outputPath: `/uploads/${path.basename(outputPath)}`,
                            width: newWidth,
                            height: newHeight,
                            maintainAspectRatio: maintainAspectRatio === 'true',
                            fileSize,
                            fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
                            processingTime
                        });
                    });
                } catch (error) {
                    handleError(res, '处理缩放结果失败', error);
                } finally {
                    // 清理临时文件
                    removeTempFile(gifPath).catch(console.error);
                }
            })
            .on('error', async (err) => {
                console.error('GIF缩放错误:', err);
                // 清理临时文件
                removeTempFile(gifPath).catch(console.error);
                
                handleError(res, 'GIF缩放失败', err);
            })
            .run();
    } catch (error) {
        // 清理临时文件
        if (req.file?.path) removeTempFile(req.file.path).catch(console.error);
        
        handleError(res, '服务器错误', error);
    }
});

// GIF压缩 - 增强版（支持透明度保留）
router.post('/compress', upload.single('gif'), async (req, res) => {
    const startTime = Date.now();
    
    try {
        // 验证文件扩展名
        validateFileExtension(req.file.originalname, ['.gif']);
        
        const { quality, maxWidth, maxHeight, preserveTransparency, colorCount } = req.body;
        const gifPath = req.file.path;
        
        // 确定压缩质量参数
        const qualitySettings = {
            high: { compression: 5, colors: 256 },
            medium: { compression: 15, colors: 128 },
            low: { compression: 25, colors: 64 }
        };
        
        const settings = qualitySettings[quality] || qualitySettings.medium;
        const maxColors = parseInt(colorCount) || settings.colors;
        
        // 验证颜色数量
        if (maxColors < 2 || maxColors > 256) {
            return res.status(400).json({
                success: false,
                error: '颜色数量必须在2-256之间'
            });
        }
        
        // 构建滤镜链
        let filters = [];
        
        // 可选：调整大小
        if (maxWidth || maxHeight) {
            const widthFilter = maxWidth ? `${maxWidth}` : '-1';
            const heightFilter = maxHeight ? `${maxHeight}` : '-1';
            filters.push(`scale=${widthFilter}:${heightFilter}:force_original_aspect_ratio=decrease`);
        }
        
        // 添加调色板生成和使用滤镜
        const paletteGenOptions = preserveTransparency === 'true' 
            ? `palettegen=reserve_transparent=on:transparency_color=ffffff:max_colors=${maxColors}[p]`
            : `palettegen=max_colors=${maxColors}[p]`;
        
        filters.push(`split[s0][s1];[s0]${paletteGenOptions};[s1][p]paletteuse=dither=sierra2_4a`);
        
        const filterChain = filters.join(',');
        const outputPath = path.join(uploadsDir, generateOutputFilename('compressed.gif'));
        
        // 获取原始GIF信息用于比较
        ffmpeg.ffprobe(gifPath, (err, metadata) => {
            const originalSize = metadata?.format?.size || 0;
            
            ffmpeg(gifPath)
                .outputOptions([
                    '-y',
                    `-vf "${filterChain}"`,
                    `-gifflags +transdiff`,
                    `-compression_level ${settings.compression}`,
                    '-pix_fmt rgb24',
                    '-f gif'
                ])
                .output(outputPath)
                .on('progress', (progress) => {
                    logProgress('GIF压缩', progress.percent);
                })
                .on('end', async () => {
                    try {
                        // 获取压缩后GIF信息
                        ffmpeg.ffprobe(outputPath, (err, newMetadata) => {
                            const newSize = newMetadata?.format?.size || 0;
                            const reduction = originalSize > 0 ? ((originalSize - newSize) / originalSize * 100).toFixed(2) : 'N/A';
                            const processingTime = (Date.now() - startTime) / 1000;
                            
                            res.status(200).json({
                                success: true,
                                message: 'GIF压缩成功',
                                outputPath: `/uploads/${path.basename(outputPath)}`,
                                originalSize,
                                originalSizeMB: (originalSize / (1024 * 1024)).toFixed(2),
                                compressedSize: newSize,
                                compressedSizeMB: (newSize / (1024 * 1024)).toFixed(2),
                                compressionRatio: reduction + '%',
                                quality,
                                preserveTransparency: preserveTransparency === 'true',
                                colorCount: maxColors,
                                processingTime
                            });
                        });
                    } catch (error) {
                        handleError(res, '处理压缩结果失败', error);
                    } finally {
                        // 清理临时文件
                        removeTempFile(gifPath).catch(console.error);
                    }
                })
                .on('error', async (err) => {
                    console.error('GIF压缩错误:', err);
                    // 清理临时文件
                    removeTempFile(gifPath).catch(console.error);
                    
                    handleError(res, 'GIF压缩失败', err);
                })
                .run();
        });
    } catch (error) {
        // 清理临时文件
        if (req.file?.path) removeTempFile(req.file.path).catch(console.error);
        
        handleError(res, '服务器错误', error);
    }
});

// 透明GIF优化接口
router.post('/optimize-transparent', upload.single('gif'), async (req, res) => {
    const startTime = Date.now();
    
    try {
        // 验证文件扩展名
        validateFileExtension(req.file.originalname, ['.gif']);
        
        const { alphaThreshold, dither, colorCount } = req.body;
        const gifPath = req.file.path;
        
        // 验证参数
        const threshold = parseInt(alphaThreshold) || 128;
        const ditherMode = dither || 'sierra2_4a';
        const colors = parseInt(colorCount) || 256;
        
        // 验证参数范围
        if (threshold < 0 || threshold > 255) {
            return res.status(400).json({
                success: false,
                error: 'Alpha阈值必须在0-255之间'
            });
        }
        
        if (colors < 2 || colors > 256) {
            return res.status(400).json({
                success: false,
                error: '颜色数量必须在2-256之间'
            });
        }
        
        // 支持的抖动模式
        const validDitherModes = ['none', 'bayer', 'heckbert', 'floyd_steinberg', 'sierra2_4a'];
        if (!validDitherModes.includes(ditherMode)) {
            return res.status(400).json({
                success: false,
                error: `不支持的抖动模式，有效值：${validDitherModes.join(', ')}`
            });
        }
        
        const outputPath = path.join(uploadsDir, generateOutputFilename('optimized-transparent.gif'));
        
        // 特殊为透明GIF优化的滤镜链
        const filterChain = `split[s0][s1];[s0]palettegen=reserve_transparent=on:transparency_color=ffffff:max_colors=${colors}[p];[s1][p]paletteuse=alpha_threshold=${threshold}:dither=${ditherMode}`;
        
        ffmpeg(gifPath)
            .outputOptions([
                '-y',
                `-vf "${filterChain}"`,
                `-gifflags +transdiff`,
                `-compression_level 3`,
                '-pix_fmt rgb24'
            ])
            .output(outputPath)
            .on('progress', (progress) => {
                logProgress('透明GIF优化', progress.percent);
            })
            .on('end', async () => {
                try {
                    // 获取优化后GIF信息
                    ffmpeg.ffprobe(outputPath, (err, metadata) => {
                        const fileSize = metadata?.format?.size || 0;
                        const processingTime = (Date.now() - startTime) / 1000;
                        
                        res.status(200).json({
                            success: true,
                            message: '透明GIF优化成功',
                            outputPath: `/uploads/${path.basename(outputPath)}`,
                            alphaThreshold: threshold,
                            dither: ditherMode,
                            colorCount: colors,
                            fileSize,
                            fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
                            processingTime
                        });
                    });
                } catch (error) {
                    handleError(res, '处理优化结果失败', error);
                } finally {
                    // 清理临时文件
                    removeTempFile(gifPath).catch(console.error);
                }
            })
            .on('error', async (err) => {
                console.error('透明GIF优化错误:', err);
                // 清理临时文件
                removeTempFile(gifPath).catch(console.error);
                
                handleError(res, '透明GIF优化失败', err);
            })
            .run();
    } catch (error) {
        // 清理临时文件
        if (req.file?.path) removeTempFile(req.file.path).catch(console.error);
        
        handleError(res, '服务器错误', error);
    }
});

// 视频转换为透明GIF
router.post('/from-video', upload.single('video'), async (req, res) => {
    let tempDir = null;
    const startTime = Date.now();
    
    try {
        // 验证文件扩展名
        validateFileExtension(req.file.originalname, ['.mp4', '.avi', '.mov', '.webm']);
        
        const { startTime: start, duration, fps, width, height, optimize, background, chromaKey } = req.body;
        const videoPath = req.file.path;
        
        // 验证参数
        const parsedFps = parseInt(fps) || 10;
        if (parsedFps < 1 || parsedFps > 60) {
            return res.status(400).json({
                success: false,
                error: 'FPS必须在1-60之间'
            });
        }
        
        // 验证持续时间
        if (duration) {
            const parsedDuration = parseFloat(duration);
            if (isNaN(parsedDuration) || parsedDuration <= 0 || parsedDuration > 60) {
                return res.status(400).json({
                    success: false,
                    error: '持续时间必须在0-60秒之间'
                });
            }
        }
        
        // 创建临时目录
        tempDir = createTempDirectory('video-frames');
        const outputPath = path.join(uploadsDir, generateOutputFilename('from-video.gif'));
        
        // 构建FFmpeg命令
        let filterChain = `fps=${parsedFps}`;
        
        // 添加缩放滤镜
        if (width || height) {
            filterChain += `,scale=${width || -1}:${height || -1}:flags=lanczos`;
        }
        
        // 如果需要色度键抠图
        if (chromaKey) {
            const bgColor = background || 'green';
            filterChain += `,chromakey=${bgColor}:0.3:0.2`;
        }
        
        // 添加调色板生成和使用滤镜
        if (optimize === 'true' || chromaKey) {
            // 特别优化透明度处理
            filterChain += `,split[s0][s1];[s0]palettegen=reserve_transparent=${chromaKey ? 'on' : 'off'}:transparency_color=ffffff[p];[s1][p]paletteuse=dither=sierra2_4a`;
        }
        
        let command = ffmpeg(videoPath)
            .outputOptions([
                '-y',
                `-vf "${filterChain}"`,
                `-pix_fmt rgb24`,
                `-gifflags +transdiff`,
                `-compression_level 3`
            ]);
        
        // 设置起始时间和持续时间
        if (start) {
            command = command.setStartTime(start);
        }
        
        if (duration) {
            command = command.setDuration(duration);
        }
        
        command
            .output(outputPath)
            .on('progress', (progress) => {
                logProgress('视频转GIF', progress.percent);
            })
            .on('end', async () => {
                try {
                    // 清理临时文件
                    if (tempDir) await cleanupDir(tempDir).catch(console.error);
                    
                    // 获取GIF文件信息
                    ffmpeg.ffprobe(outputPath, (err, metadata) => {
                        const fileSize = metadata?.format?.size || 0;
                        const processingTime = (Date.now() - startTime) / 1000;
                        
                        res.status(200).json({
                            success: true,
                            message: '视频转GIF成功',
                            outputPath: `/uploads/${path.basename(outputPath)}`,
                            fps: parsedFps,
                            startTime: start,
                            duration,
                            hasTransparency: !!chromaKey,
                            optimize: optimize === 'true',
                            background,
                            fileSize,
                            fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
                            processingTime
                        });
                    });
                } catch (cleanupError) {
                    console.error('清理临时文件失败:', cleanupError);
                    res.status(200).json({
                        success: true,
                        message: '视频转GIF成功（临时文件清理失败）',
                        outputPath: `/uploads/${path.basename(outputPath)}`
                    });
                } finally {
                    // 清理上传的视频文件
                    removeTempFile(videoPath).catch(console.error);
                }
            })
            .on('error', async (err) => {
                console.error('视频转GIF错误:', err);
                // 尝试清理临时文件
                if (tempDir) await cleanupDir(tempDir).catch(console.error);
                removeTempFile(videoPath).catch(console.error);
                
                handleError(res, '视频转GIF失败', err);
            })
            .run();
    } catch (error) {
        console.error('服务器错误:', error);
        // 清理临时资源
        if (tempDir) await cleanupDir(tempDir).catch(console.error);
        if (req.file?.path) removeTempFile(req.file.path).catch(console.error);
        
        handleError(res, '服务器错误', error);
    }
});

// 批量处理透明GIF接口
router.post('/batch-process', upload.array('gifs'), async (req, res) => {
    const startTime = Date.now();
    const results = [];
    
    try {
        const { action, quality, maxWidth, maxHeight } = req.body;
        
        // 验证是否上传了GIF
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: '请上传至少一个GIF文件'
            });
        }
        
        // 限制文件数量
        if (req.files.length > 10) {
            return res.status(400).json({
                success: false,
                error: '一次最多处理10个文件'
            });
        }
        
        // 验证动作类型
        const validActions = ['compress', 'resize'];
        if (!action || !validActions.includes(action)) {
            return res.status(400).json({
                success: false,
                error: `动作类型必须是以下之一: ${validActions.join(', ')}`
            });
        }
        
        // 处理每个GIF
        for (const file of req.files) {
            try {
                // 验证文件扩展名
                validateFileExtension(file.originalname, ['.gif']);
                
                const gifPath = file.path;
                const outputPath = path.join(uploadsDir, generateOutputFilename(`${path.parse(file.originalname).name}-processed.gif`));
                
                // 根据动作类型处理
                switch (action) {
                    case 'compress':
                        // 压缩处理
                        const qualitySettings = {
                            high: 5,
                            medium: 15,
                            low: 25
                        };
                        const compressionLevel = qualitySettings[quality] || qualitySettings.medium;
                        
                        await new Promise((resolve, reject) => {
                            ffmpeg(gifPath)
                                .outputOptions([
                                    '-y',
                                    `-vf "split[s0][s1];[s0]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[s1][p]paletteuse"`,
                                    `-gifflags +transdiff`,
                                    `-compression_level ${compressionLevel}`,
                                    '-pix_fmt rgb24'
                                ])
                                .output(outputPath)
                                .on('progress', (progress) => {
                                    logProgress(`批量处理 - ${file.originalname}`, progress.percent);
                                })
                                .on('end', resolve)
                                .on('error', reject)
                                .run();
                        });
                        
                        const fileSize = getFileSize(outputPath);
                        results.push({
                            original: file.originalname,
                            outputPath: `/uploads/${path.basename(outputPath)}`,
                            status: 'success',
                            fileSize,
                            fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
                            quality
                        });
                        break;
                        
                    case 'resize':
                        // 调整大小
                        if (!maxWidth && !maxHeight) {
                            throw new Error('调整大小时必须提供宽度或高度');
                        }
                        
                        await new Promise((resolve, reject) => {
                            ffmpeg(gifPath)
                                .outputOptions([
                                    '-y',
                                    `-vf "scale=${maxWidth || -1}:${maxHeight || -1}:force_original_aspect_ratio=decrease,split[s0][s1];[s0]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[s1][p]paletteuse"`,
                                    `-gifflags +transdiff`,
                                    '-pix_fmt rgb24'
                                ])
                                .output(outputPath)
                                .on('progress', (progress) => {
                                    logProgress(`批量处理 - ${file.originalname}`, progress.percent);
                                })
                                .on('end', resolve)
                                .on('error', reject)
                                .run();
                        });
                        
                        // 获取调整后的GIF信息
                        const resizeFileSize = getFileSize(outputPath);
                        results.push({
                            original: file.originalname,
                            outputPath: `/uploads/${path.basename(outputPath)}`,
                            status: 'success',
                            width: maxWidth,
                            height: maxHeight,
                            fileSize: resizeFileSize,
                            fileSizeMB: (resizeFileSize / (1024 * 1024)).toFixed(2)
                        });
                        break;
                        
                    default:
                        throw new Error('不支持的批量处理动作');
                }
            } catch (err) {
                console.error(`处理文件 ${file.originalname} 失败:`, err);
                results.push({
                    original: file.originalname,
                    status: 'error',
                    error: err.message
                });
            } finally {
                // 清理临时文件
                if (file?.path) removeTempFile(file.path).catch(console.error);
            }
        }
        
        const processingTime = (Date.now() - startTime) / 1000;
        const successCount = results.filter(r => r.status === 'success').length;
        
        res.status(200).json({
            success: true,
            message: '批量处理完成',
            results,
            successCount,
            totalCount: results.length,
            processingTime,
            completionRate: ((successCount / results.length) * 100).toFixed(2) + '%'
        });
    } catch (error) {
        console.error('服务器错误:', error);
        // 清理所有临时文件
        if (req.files) {
            for (const file of req.files) {
                if (file?.path) removeTempFile(file.path).catch(console.error);
            }
        }
        
        handleError(res, '服务器错误', error);
    }
});

module.exports = router;