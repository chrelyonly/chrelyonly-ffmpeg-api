# 多媒体处理API服务

这是一个基于Node.js和FFmpeg的强大多媒体处理API服务，专注于高质量图像处理、透明GIF创建与优化。服务提供了丰富的HTTP接口，让开发者可以轻松集成多媒体处理功能到自己的应用中。

## 核心功能

### 🔍 图像处理
- **高级抠图**：支持色度键(chromakey)、颜色键(colorkey)和Alpha通道(alphakey)三种抠图方式
- **图像编辑**：裁剪、缩放、格式转换等基础操作
- **透明处理**：支持高质量的透明图像生成和处理

### 🎞️ GIF处理
- **透明GIF优化**：专门针对透明GIF的高质量优化算法
- **GIF编辑**：分解、创建、裁剪、缩放、压缩等全方位功能
- **视频转GIF**：支持从视频片段创建GIF，可选择生成透明背景
- **批量处理**：支持多个GIF的批量优化和转换

### 📹 视频处理
- **视频信息获取**：获取详细的视频元数据
- **视频转换**：格式转换、剪切、压缩等功能
- **视频提取**：支持从视频中提取图像序列

## 技术栈

- **Node.js** - JavaScript运行时
- **Express.js** - Web框架
- **FFmpeg** - 多媒体处理核心
- **fluent-ffmpeg** - FFmpeg的Node.js封装
- **Multer** - 文件上传处理
- **CORS** - 跨域资源共享支持

## 🚀 快速开始

### 前提条件
- Node.js 14或更高版本
- FFmpeg已安装并添加到系统环境变量
- 足够的磁盘空间用于文件处理

### 安装步骤
1. 克隆项目并进入目录：
```bash
git clone <repository-url>
cd chrelyonly-ffmpeg-api
```

2. 安装所有依赖（后端 + 前端）：
```bash
npm run install-all
```

3. 启动完整服务（后端API + 前端测试工具）：
```bash
npm run start-all
```

### 验证服务
- **后端API服务**：使用curl检查健康状态
  ```bash
  curl http://localhost:3000/health
  ```
- **前端测试工具**：访问前端界面进行功能测试
  ```bash
  http://localhost:8080
  ```

## 目录结构

```
chrelyonly-ffmpeg-api/
├── controllers/        # API控制器
│   ├── gifController.js    # GIF处理相关接口
│   ├── imageController.js  # 图像处理相关接口
│   └── videoController.js  # 视频处理相关接口
├── uploads/           # 上传和处理后的文件存储目录
├── temp/              # 临时文件目录
├── index.js           # 应用入口文件
├── package.json       # 项目配置和依赖
├── API_DOCUMENTATION.md  # 详细API文档
└── README.md          # 项目说明（当前文件）
```

## 📚 使用指南

### 方法一：使用前端测试工具（推荐）
1. 确保后端API服务和前端测试工具都已启动：`npm run start-all`
2. 打开浏览器访问：`http://localhost:8080`
3. 在界面上选择要测试的API功能
4. 上传文件并设置参数
5. 点击执行按钮，查看处理结果

### 方法二：使用HTTP客户端
1. **上传文件**：通过相应的API接口上传需要处理的媒体文件
2. **设置参数**：根据需要设置处理参数（如尺寸、质量、特殊效果等）
3. **获取结果**：API返回处理结果和输出文件的访问路径
4. **使用输出**：通过返回的路径访问处理后的文件

### 常用API示例

#### 1. 色度键抠图（创建透明背景图像）

**请求**：
```bash
curl -X POST http://localhost:3000/api/image/chromakey \
  -F "image=@green-screen.jpg" \
  -F "color=green" \
  -F "similarity=0.3" \
  -F "blend=0.2"
```

**响应**：
```json
{
  "message": "抠图成功",
  "outputPath": "/uploads/1630000000000-chromakey.png"
}
```

#### 2. 创建透明GIF

**请求**：
```bash
curl -X POST http://localhost:3000/api/gif/create \
  -F "images[]=@frame1.png" \
  -F "images[]=@frame2.png" \
  -F "images[]=@frame3.png" \
  -F "fps=12" \
  -F "optimize=true"
```

**响应**：
```json
{
  "message": "GIF创建成功",
  "outputPath": "/uploads/1630000000001-output.gif",
  "frameCount": 3
}
```

## 详细API文档

请查看项目根目录下的 [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) 文件，获取完整的API接口说明、参数列表和使用示例。

## 🛠️ 开发与部署

### 开发模式
- **后端开发**：`npm run dev`
- **前端开发**：`npm run frontend-dev`
- **全栈开发**：`npm run start-all`

### 安装与启动脚本
- **安装所有依赖**：`npm run install-all`
- **只安装前端依赖**：`npm run frontend-install`
- **启动后端服务**：`npm start`
- **启动前端服务**：`npm run frontend-start`
- **启动完整服务**：`npm run start-all`
- **检查服务健康状态**：`npm run health-check`

### 清理缓存和临时文件
```bash
npm run clean
```

## 注意事项

1. **文件大小限制**：默认上传限制为100MB
2. **处理时间**：复杂操作（如高质量GIF创建）可能需要较长时间
3. **FFmpeg要求**：确保FFmpeg已正确安装并添加到系统环境变量
4. **磁盘空间**：定期清理临时文件，或使用 `npm run clean` 命令
5. **性能考虑**：处理大型文件时，建议调整Node.js内存限制

## 透明GIF处理优化

本服务特别优化了透明GIF的处理能力，包括：
- 高级调色板生成，保留透明信息
- 多种抖动算法，优化透明边缘质量
- 智能压缩算法，减小文件大小的同时保持质量

## 许可证

本项目采用MIT许可证。详情请查看LICENSE文件。