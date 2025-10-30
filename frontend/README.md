# FFmpeg API 测试工具

这是一个简单的前端测试工具，用于测试后端的FFmpeg API功能。

## 功能特性

- **图像处理API测试**：支持色度键抠图、高级抠图、图像裁剪、图像缩放等功能
- **GIF处理API测试**：支持GIF分解、GIF压缩、视频转GIF等功能
- **视频处理API测试**：支持视频信息获取、视频转换、视频剪切、视频压缩等功能
- **友好的用户界面**：使用Tailwind CSS构建的现代化界面
- **实时进度显示**：上传和处理过程中的进度指示
- **响应式设计**：支持各种屏幕尺寸
- **错误处理**：详细的错误信息和通知系统

## 使用方法

### 1. 启动后端服务

确保您的FFmpeg API后端服务正在运行，默认情况下工具会尝试连接到 `http://localhost:3000`。

### 2. 启动前端测试工具

#### 方法一：使用Python的内置HTTP服务器

```bash
# 在frontend目录下运行
cd frontend
python -m http.server 8000
```

然后在浏览器中访问 `http://localhost:8000`

#### 方法二：使用其他HTTP服务器

您也可以使用任何其他的静态文件服务器，如Node.js的http-server：

```bash
# 安装http-server
npm install -g http-server

# 在frontend目录下运行
cd frontend
http-server -p 8000
```

### 3. 测试API

1. 在界面上选择您想要测试的API类别（图像处理、GIF处理或视频处理）
2. 选择具体的API功能
3. 根据需要上传相应的文件（图片、GIF或视频）
4. 设置必要的参数
5. 点击「执行处理」按钮
6. 查看处理结果和响应数据

## 项目结构

- `index.html` - 主页面，包含所有UI和JavaScript逻辑
- `styles.css` - 自定义CSS样式
- `utils.js` - 工具函数库

## API路径配置

当前API路径配置如下：

### 图像处理
- 色度键抠图：`/api/image/chromakey`
- 高级抠图：`/api/image/advanced-keying`\
- 图像裁剪：`/api/image/crop`
- 图像缩放：`/api/image/resize`

### GIF处理
- GIF分解：`/api/gif/explode`
- GIF压缩：`/api/gif/compress`
- 视频转GIF：`/api/gif/from-video`

### 视频处理
- 视频信息：`/api/video/info`
- 视频转换：`/api/video/convert`
- 视频剪切：`/api/video/trim`
- 视频压缩：`/api/video/compress`

## 注意事项

- 确保浏览器支持所需的HTML5和JavaScript功能
- 对于大文件处理，可能需要调整后端的超时设置
- 某些功能可能需要后端FFmpeg支持相应的编解码器

## 许可证

MIT