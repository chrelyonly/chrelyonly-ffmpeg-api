# FFmpeg 多媒体处理 API 文档

本文档详细介绍了基于FFmpeg的多媒体处理API服务的所有接口，包括图像处理、GIF处理和视频处理的功能。

## 目录

1. [项目概述](#项目概述)
2. [API基础信息](#api基础信息)
3. [图像处理接口](#图像处理接口)
4. [GIF处理接口](#gif处理接口)
5. [视频处理接口](#视频处理接口)
6. [健康检查](#健康检查)
7. [错误处理](#错误处理)
8. [最佳实践](#最佳实践)

## 项目概述

这是一个基于Node.js和FFmpeg的多媒体处理API服务，专注于提供高质量的图像处理、透明GIF创建与优化功能。

## API基础信息

- **API基础URL**: `http://localhost:3000/api`
- **请求方法**: 主要使用POST方法，用于文件上传和处理
- **响应格式**: JSON
- **文件访问**: 处理后的文件可通过 `/uploads/[filename]` 访问

## 图像处理接口

### 色度键抠图

**接口**: `POST /api/image/chromakey`

**功能**: 将图像中的特定颜色（如绿色、蓝色）区域替换为透明

**参数**:
- `image`: 要处理的图像文件 (必需)
- `color`: 要抠除的颜色，可以是颜色名称（如green、blue）、十六进制值或RGB格式 (必需)
- `similarity`: 相似度阈值，范围0-1，默认0.3 (可选)
- `blend`: 混合强度，范围0-1，默认0.2 (可选)
- `showMask`: 是否只显示遮罩（true/false），默认false (可选)

**返回值**:
```json
{
  "message": "抠图成功",
  "outputPath": "/uploads/[filename].png",
  "colorUsed": "green",
  "similarity": 0.3,
  "blend": 0.2
}
```

### 高级抠图

**接口**: `POST /api/image/advanced-keying`

**功能**: 支持多种抠图方式，包括色度键、颜色键和Alpha通道抠图

**参数**:
- `image`: 要处理的图像文件 (必需)
- `method`: 抠图方式 (必需)，可选值：
  - `chromakey`: 色度键抠图（适合蓝绿幕）
  - `colorkey`: 颜色键抠图（精确颜色匹配）
  - `alphakey`: Alpha通道抠图（基于图像透明度）
- `color`: 当method为chromakey或colorkey时必需，要抠除的颜色
- `similarity`: 相似度阈值，范围0-1 (可选)
- `blend`: 混合强度，范围0-1 (可选)
- `threshold`: 当method为alphakey时使用，阈值 (可选)
- `softness`: 当method为alphakey时使用，柔和度 (可选)

**返回值**:
```json
{
  "message": "高级抠图成功",
  "outputPath": "/uploads/[filename].png",
  "method": "chromakey"
}
```

### 图像裁剪

**接口**: `POST /api/image/crop`

**功能**: 裁剪图像到指定尺寸

**参数**:
- `image`: 要处理的图像文件 (必需)
- `width`: 裁剪后的宽度 (必需)
- `height`: 裁剪后的高度 (必需)
- `x`: 起始X坐标，默认0 (可选)
- `y`: 起始Y坐标，默认0 (可选)

**返回值**:
```json
{
  "message": "裁剪成功",
  "outputPath": "/uploads/[filename].png"
}
```

### 图像缩放

**接口**: `POST /api/image/resize`

**功能**: 调整图像尺寸

**参数**:
- `image`: 要处理的图像文件 (必需)
- `width`: 缩放后的宽度 (可选)
- `height`: 缩放后的高度 (可选)
- `maintainAspectRatio`: 是否保持宽高比 (true/false)，默认true (可选)

**返回值**:
```json
{
  "message": "缩放成功",
  "outputPath": "/uploads/[filename].png"
}
```

## GIF处理接口

### GIF分解

**接口**: `POST /api/gif/explode`

**功能**: 将GIF分解为图片序列

**参数**:
- `gif`: 要分解的GIF文件 (必需)
- `format`: 输出图片格式，默认png (可选)
- `preserveAlpha`: 是否保留透明度 (true/false)，默认false (可选)

**返回值**:
```json
{
  "message": "GIF分解成功",
  "frames": ["/uploads/[dirname]/frame_0001.png", ...],
  "frameCount": 24,
  "fps": "10/1",
  "duration": "2.40",
  "format": "png",
  "preserveAlpha": true
}
```

### 创建GIF

**接口**: `POST /api/gif/create`

**功能**: 将图片序列合成为GIF动画

**参数**:
- `images[]`: 要合成的图片文件数组 (必需)
- `fps`: 帧率，默认10 (可选)
- `loop`: 循环次数，0表示无限循环，默认0 (可选)
- `optimize`: 是否优化质量和大小 (true/false)，默认false (可选)
- `colorCount`: 颜色数量，默认256 (可选)
- `transparencyThreshold`: 透明度阈值，默认128 (可选)

**返回值**:
```json
{
  "message": "GIF创建成功",
  "outputPath": "/uploads/[filename].gif",
  "frameCount": 24,
  "fps": 10,
  "loop": 0,
  "optimize": true,
  "fileSize": 1048576,
  "fileSizeMB": "1.00"
}
```

### GIF裁剪

**接口**: `POST /api/gif/crop`

**功能**: 裁剪GIF动画

**参数**:
- `gif`: 要裁剪的GIF文件 (必需)
- `width`: 裁剪后的宽度 (必需)
- `height`: 裁剪后的高度 (必需)
- `x`: 起始X坐标，默认0 (可选)
- `y`: 起始Y坐标，默认0 (可选)

**返回值**:
```json
{
  "message": "GIF裁剪成功",
  "outputPath": "/uploads/[filename].gif"
}
```

### GIF缩放

**接口**: `POST /api/gif/resize`

**功能**: 调整GIF动画尺寸

**参数**:
- `gif`: 要缩放的GIF文件 (必需)
- `width`: 缩放后的宽度 (可选)
- `height`: 缩放后的高度 (可选)
- `maintainAspectRatio`: 是否保持宽高比 (true/false)，默认true (可选)

**返回值**:
```json
{
  "message": "GIF缩放成功",
  "outputPath": "/uploads/[filename].gif"
}
```

### GIF压缩

**接口**: `POST /api/gif/compress`

**功能**: 压缩GIF动画，支持保留透明度

**参数**:
- `gif`: 要压缩的GIF文件 (必需)
- `quality`: 压缩质量，可选值: high, medium, low，默认medium (可选)
- `maxWidth`: 最大宽度 (可选)
- `maxHeight`: 最大高度 (可选)
- `preserveTransparency`: 是否保留透明度 (true/false)，默认true (可选)
- `colorCount`: 颜色数量，默认根据quality设定 (可选)

**返回值**:
```json
{
  "message": "GIF压缩成功",
  "outputPath": "/uploads/[filename].gif",
  "originalSize": 2097152,
  "compressedSize": 1048576,
  "compressionRatio": "50.00%",
  "quality": "medium",
  "preserveTransparency": true,
  "colorCount": 128
}
```

### 透明GIF优化

**接口**: `POST /api/gif/optimize-transparent`

**功能**: 专门为透明GIF进行优化，提高质量和减少文件大小

**参数**:
- `gif`: 要优化的GIF文件 (必需)
- `alphaThreshold`: 透明度阈值，默认128 (可选)
- `dither`: 抖动算法，默认sierra2_4a (可选)
- `colorCount`: 颜色数量，默认256 (可选)

**返回值**:
```json
{
  "message": "透明GIF优化成功",
  "outputPath": "/uploads/[filename].gif",
  "alphaThreshold": 128,
  "dither": "sierra2_4a",
  "colorCount": 256,
  "fileSize": 524288,
  "fileSizeMB": "0.50"
}
```

### 视频转GIF

**接口**: `POST /api/gif/from-video`

**功能**: 将视频片段转换为GIF动画，支持色度键抠图生成透明背景

**参数**:
- `video`: 源视频文件 (必需)
- `startTime`: 开始时间，格式为秒或HH:MM:SS (可选)
- `duration`: 持续时间，格式为秒 (可选)
- `fps`: 帧率，默认10 (可选)
- `width`: 输出宽度 (可选)
- `height`: 输出高度 (可选)
- `optimize`: 是否优化 (true/false)，默认false (可选)
- `background`: 背景色，用于色度键抠图 (可选)
- `chromaKey`: 是否启用色度键抠图 (true/false)，默认false (可选)

**返回值**:
```json
{
  "message": "视频转GIF成功",
  "outputPath": "/uploads/[filename].gif",
  "fps": 10,
  "startTime": "00:00:05",
  "duration": "5",
  "hasTransparency": true,
  "optimize": true,
  "fileSize": 2097152,
  "fileSizeMB": "2.00"
}
```

### 批量处理GIF

**接口**: `POST /api/gif/batch-process`

**功能**: 批量处理多个GIF文件

**参数**:
- `gifs[]`: 要处理的GIF文件数组 (必需)
- `action`: 处理动作，可选值: compress, resize (必需)
- `quality`: 当action为compress时，压缩质量 (可选)
- `maxWidth`: 当action为resize时，最大宽度 (可选)
- `maxHeight`: 当action为resize时，最大高度 (可选)

**返回值**:
```json
{
  "message": "批量处理完成",
  "results": [
    {
      "original": "input1.gif",
      "outputPath": "/uploads/[filename1].gif",
      "status": "success"
    },
    {
      "original": "input2.gif",
      "status": "error",
      "error": "处理失败原因"
    }
  ],
  "successCount": 1,
  "totalCount": 2
}
```

## 健康检查

**接口**: `GET /health`

**功能**: 检查API服务状态和资源使用情况

**返回值**:
```json
{
  "status": "ok",
  "message": "多媒体处理API服务运行中",
  "version": "1.2.0",
  "features": {
    "imageProcessing": true,
    "transparentGifSupport": true,
    "videoProcessing": true,
    "batchProcessing": true
  },
  "stats": {
    "uploadsDirSize": "5.2 MB",
    "tempDirSize": "100.5 KB",
    "freeSpace": "245.3 GB",
    "timestamp": "2023-06-01T12:00:00Z"
  }
}
```

## 错误处理

所有API接口返回的错误格式如下：

```json
{
  "status": "error",
  "message": "错误描述",
  "details": "详细错误信息（开发环境）"
}
```

常见错误状态码：
- `400`: 请求参数错误
- `404`: API端点不存在
- `500`: 服务器内部错误

## 最佳实践

1. **透明GIF优化技巧**:
   - 使用 `optimize-transparent` 接口处理已有的透明GIF
   - 在创建GIF时设置 `optimize=true` 并调整 `colorCount` 参数
   - 对于有固定背景色的素材，使用色度键抠图后再生成GIF

2. **性能优化建议**:
   - 处理大型GIF时，考虑先调整尺寸再进行其他处理
   - 对于批量处理，建议限制单次处理的文件数量
   - 合理设置超时时间，大型文件处理可能需要较长时间

3. **临时文件管理**:
   - 服务会自动清理过期的临时文件
   - 可通过 `npm run clean` 手动清理所有临时文件
   - 处理大量文件时，定期检查磁盘空间

4. **常见问题排查**:
   - 确保FFmpeg已正确安装并配置到系统环境变量
   - 检查上传文件大小是否超过限制
   - 对于复杂处理，确认参数格式正确

## 视频处理接口

### 视频信息获取

**接口**: `POST /api/video/info`

**功能**: 获取视频文件的详细元数据信息，包括格式、时长、编码等信息

**参数**:
- `video`: 要分析的视频文件 (必需)

**返回值**:
```json
{
  "success": true,
  "message": "获取视频信息成功",
  "processingTime": "0.25",
  "fileSize": 10485760,
  "metadata": {
    "format": "mp4",
    "duration": 60.5,
    "width": 1920,
    "height": 1080,
    "fps": 30.0,
    "bitrate": 1500,
    "streams": [
      {
        "type": "video",
        "codec": "h264",
        "width": 1920,
        "height": 1080,
        "fps": 30.0
      },
      {
        "type": "audio",
        "codec": "aac",
        "sampleRate": 44100,
        "channels": 2
      }
    ]
  },
  "sourceFile": "/uploads/1234567890-video.mp4"
}
```

### 视频格式转换

**接口**: `POST /api/video/convert`

**功能**: 将视频转换为不同的格式，并可选择性地设置视频和音频编解码器

**参数**:
- `video`: 源视频文件 (必需)
- `format`: 目标格式，如mp4、webm等 (必需)
- `videoCodec`: 视频编解码器，如libx264、libvpx-vp9等 (可选)
- `audioCodec`: 音频编解码器，如aac、opus等 (可选)

**返回值**:
```json
{
  "success": true,
  "message": "转码成功",
  "processingTime": "15.42",
  "fileSize": 5242880,
  "output_url": "/uploads/1234567890-output.mp4"
}
```

### 视频剪切

**接口**: `POST /api/video/trim`

**功能**: 根据指定的起始时间和持续时间剪切视频片段，支持快速剪切和重新编码两种模式

**参数**:
- `video`: 源视频文件 (必需)
- `startTime`: 剪切起始时间（秒） (必需)
- `duration`: 剪切持续时间（秒） (必需)

**返回值**:
```json
{
  "success": true,
  "message": "剪切成功",
  "processingTime": "8.25",
  "fileSize": 2621440,
  "output_url": "/uploads/1234567890-trimmed.mp4"
}
```

### 视频压缩

**接口**: `POST /api/video/compress`

**功能**: 通过调整视频比特率来压缩视频文件大小，支持质量预设和自定义比特率

**参数**:
- `video`: 源视频文件 (必需)
- `quality`: 压缩质量预设，可选值：high、medium、low (可选)
- `bitrate`: 自定义视频比特率（kbps），优先级高于quality (可选)

**返回值**:
```json
{
  "success": true,
  "message": "压缩成功",
  "processingTime": "22.67",
  "fileSize": 3145728,
  "originalSize": 10485760,
  "compressionRatio": "70.0%",
  "output_url": "/uploads/1234567890-compressed.mp4"
}
```

### 视频缩放

**接口**: `POST /api/video/resize`

**功能**: 调整视频尺寸大小，可选择是否保持宽高比

**参数**:
- `video`: 源视频文件 (必需)
- `width`: 目标宽度 (可选)
- `height`: 目标高度 (可选)
- `maintainAspect`: 是否保持宽高比 (true/false)，默认true (可选)

**返回值**:
```json
{
  "success": true,
  "message": "缩放成功",
  "processingTime": "18.35",
  "fileSize": 4194304,
  "metadata": {
    "width": 1280,
    "height": 720
  },
  "output_url": "/uploads/1234567890-resized.mp4"
}
```

## 健康检查

**接口**: `GET /health`

**功能**: 检查API服务状态、资源使用情况和功能可用性

**返回值**:
```json
{
  "success": true,
  "message": "多媒体处理API服务运行中",
  "version": "1.3.0",
  "features": {
    "imageProcessing": {
      "enabled": true,
      "endpoints": ["/api/image/chromaKey", "/api/image/advancedRemoveBg", "/api/image/resize"]
    },
    "transparentGifSupport": {
      "enabled": true,
      "endpoints": ["/api/gif/transparent", "/api/gif/optimize"]
    },
    "videoProcessing": {
      "enabled": true,
      "endpoints": ["/api/video/info", "/api/video/convert", "/api/video/trim", "/api/video/compress", "/api/video/resize"]
    },
    "batchProcessing": {
      "enabled": true,
      "maxBatchSize": 10
    }
  },
  "stats": {
    "uploadsDirSize": "5.2 MB",
    "tempDirSize": "100.5 KB",
    "freeSpace": "245.3 GB",
    "fileStats": {
      "total": 42,
      "video": 15,
      "image": 20,
      "gif": 5,
      "other": 2
    },
    "timestamp": "2023-06-01T12:00:00Z",
    "serverInfo": {
      "nodeVersion": "v16.15.1",
      "memoryUsage": "128.5 MB"
    }
  }
}

## 错误处理

所有API接口返回的错误格式统一如下：

```json
{
  "success": false,
  "message": "错误描述",
  "details": "详细错误信息（开发环境）",
  "stack": "错误堆栈信息（仅开发环境）"
}

常见错误状态码：
- `400`: 请求参数错误
- `404`: API端点不存在
- `413`: 文件大小超过限制
- `500`: 服务器内部错误

## 最佳实践

1. **视频处理优化技巧**:
   - 处理大型视频时，优先考虑剪切再进行其他处理
   - 格式转换时选择适当的编解码器，MP4使用H.264，WebM使用VP9
   - 压缩视频时根据目标平台选择合适的比特率

2. **性能优化建议**:
   - 处理长视频前可先降低分辨率
   - 视频转GIF时控制时长和分辨率以优化文件大小
   - 批量处理时限制单次处理文件数量

3. **资源管理**:
   - 定期检查上传目录大小，及时清理不需要的文件
   - 监控服务器磁盘空间，避免存储耗尽
   - 大型处理任务应设置合理的超时时间

## 示例代码

### 使用Node.js调用接口示例

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// 色度键抠图示例
async function chromakeyExample() {
  const formData = new FormData();
  formData.append('image', fs.createReadStream('./green-screen.jpg'));
  formData.append('color', 'green');
  formData.append('similarity', '0.3');
  formData.append('blend', '0.2');
  
  try {
    const response = await axios.post(
      'http://localhost:3000/api/image/chromakey',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    console.log('抠图结果:', response.data);
  } catch (error) {
    console.error('请求失败:', error.response.data);
  }
}

// 调用函数
chromakeyExample();
```

### 创建透明GIF示例

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// 创建透明GIF示例
async function createTransparentGifExample() {
  const formData = new FormData();
  
  // 添加多个图片文件
  formData.append('images[]', fs.createReadStream('./frame1.png'));
  formData.append('images[]', fs.createReadStream('./frame2.png'));
  formData.append('images[]', fs.createReadStream('./frame3.png'));
  
  // 设置GIF参数
  formData.append('fps', '15');
  formData.append('optimize', 'true');
  formData.append('colorCount', '128');
  formData.append('transparencyThreshold', '100');
  
  try {
    const response = await axios.post(
      'http://localhost:3000/api/gif/create',
      formData,
      {
        headers: formData.getHeaders(),
      }
    );
    console.log('GIF创建结果:', response.data);
  } catch (error) {
    console.error('请求失败:', error.response.data);
  }
}

// 调用函数
createTransparentGifExample();
```

### 视频转透明GIF示例

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// 视频转透明GIF示例（蓝绿幕抠图）
async function videoToTransparentGifExample() {
  const formData = new FormData();
  formData.append('video', fs.createReadStream('./green-screen-video.mp4'));
  formData.append('startTime', '00:00:02');
  formData.append('duration', '5');
  formData.append('fps', '12');
  formData.append('width', '640');
  formData.append('optimize', 'true');
  formData.append('background', 'green');
  formData.append('chromaKey', 'true');
  
  try {
    const response = await axios.post(
      'http://localhost:3000/api/gif/from-video',
      formData,
      {
        headers: formData.getHeaders(),
      }
    );
    console.log('视频转GIF结果:', response.data);
  } catch (error) {
    console.error('请求失败:', error.response.data);
  }
}

// 调用函数
videoToTransparentGifExample();

### 视频信息获取示例

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// 获取视频信息示例
async function getVideoInfoExample() {
  const formData = new FormData();
  formData.append('video', fs.createReadStream('./sample-video.mp4'));
  
  try {
    const response = await axios.post(
      'http://localhost:3000/api/video/info',
      formData,
      {
        headers: formData.getHeaders(),
      }
    );
    console.log('视频信息:', response.data);
    console.log('视频时长:', response.data.metadata.duration, '秒');
    console.log('视频分辨率:', response.data.metadata.width, 'x', response.data.metadata.height);
  } catch (error) {
    console.error('请求失败:', error.response?.data || error.message);
  }
}

// 调用函数
getVideoInfoExample();
```

### 视频压缩示例

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// 视频压缩示例
async function compressVideoExample() {
  const formData = new FormData();
  formData.append('video', fs.createReadStream('./large-video.mp4'));
  formData.append('quality', 'medium'); // 使用质量预设
  // 或者使用自定义比特率：
  // formData.append('bitrate', '1000'); // 1000 kbps
  
  try {
    // 显示进度的处理
    console.log('开始压缩视频...');
    const startTime = Date.now();
    
    const response = await axios.post(
      'http://localhost:3000/api/video/compress',
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 600000, // 10分钟超时，适合大型视频
      }
    );
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`压缩完成，耗时 ${duration.toFixed(2)} 秒`);
    console.log('压缩结果:', response.data);
    console.log(`压缩率: ${response.data.compressionRatio}`);
    console.log(`原始大小: ${(response.data.originalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`压缩后大小: ${(response.data.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`下载链接: http://localhost:3000${response.data.output_url}`);
  } catch (error) {
    console.error('请求失败:', error.response?.data || error.message);
  }
}

// 调用函数
compressVideoExample();
```
```