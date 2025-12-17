// server.js
import express from 'express';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 2233;

// -------------------------
// 工具函数
// -------------------------

function getCurrentTimeDir() {
    const d = new Date();
    const pad = n => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function saveBase64Image(base64, filePath) {
    console.log(`💾 保存 Base64 图片到: ${filePath}`);
    const buffer = Buffer.from(base64, "base64");
    await fsPromises.writeFile(filePath, buffer);
}

function runExecCmd(args) {
    return new Promise((resolve, reject) => {
        console.log(`▶ 执行合成命令: ${args.join(' ')}`);
        execFile('./ffmpeg', args, { timeout: 15000 },(err, stdout, stderr) => {
            if (stdout) console.log("📄 stdout:", stdout.trim());
            if (stderr) console.warn("⚠ stderr:", stderr.trim());
            if (err) {
                console.error("❌ 合成命令执行失败:", err);
                return reject(err);
            }
            console.log("✅ 合成命令执行完成");
            resolve();
        });
    });
}

async function cleanOldDirs(baseDir, minutes = 5) {
    try {
        const dirs = await fsPromises.readdir(baseDir, { withFileTypes: true });
        const now = Date.now();
        for (const dirent of dirs) {
            if (!dirent.isDirectory()) continue;
            const dirName = dirent.name;
            const dirTime = new Date(
                dirName.slice(0,4),
                parseInt(dirName.slice(4,6))-1,
                dirName.slice(6,8),
                dirName.slice(8,10),
                dirName.slice(10,12)
            ).getTime();
            if (now - dirTime > minutes * 60 * 1000) {
                const fullPath = path.join(baseDir, dirName);
                fsPromises.rm(fullPath, { recursive: true, force: true })
                    .then(() => console.log(`🗑 删除旧目录: ${fullPath}`))
                    .catch(() => {});
            }
        }
    } catch (err) {
        console.error("❌ 清理旧目录失败:", err);
    }
}

// -------------------------
// 初始化根目录
// -------------------------
const TEMP_ROOT = path.join(__dirname, 'temp');
const IMAGE_ROOT = path.join(__dirname, 'images');

await fsPromises.mkdir(TEMP_ROOT, { recursive: true });
console.log(`📂 临时文件根目录: ${TEMP_ROOT}`);
await fsPromises.mkdir(IMAGE_ROOT, { recursive: true });
console.log(`📂 合成图片根目录: ${IMAGE_ROOT}`);

// 定时器：每5分钟清理一次旧文件夹
setInterval(() => {
    console.log("⏰ 定时清理旧目录任务启动");
    cleanOldDirs(TEMP_ROOT, 5);
    cleanOldDirs(IMAGE_ROOT, 5);
}, 5 * 60 * 1000);

// -------------------------
// 中间件
// -------------------------
app.use(express.json({ limit: '10mb' }));

// ======================================================================
// 抠图接口：上传 Base64 + 图片合成 + 返回最终图片 （一个接口）
// ======================================================================
app.post('/ffmpeg/generate', async (req, res) => {
    try {
        console.log("📥 接收到透明抠图 + GIF 合成请求");

        const {
            image = "",
            color = "0xFEFEFE",      // 默认抠图颜色
            similarity = 0.02,       // 默认相似度
            blend = 0.0              // 默认混合度
        } = req.body;

        if (!image) {
            return res.status(400).json({ error: "没有提供图片" });
        }

        // 参数校验：
        const safeColor = /^0x[0-9A-Fa-f]{6}$/.test(color) ? color : "0xFEFEFE";
        const sim = Math.max(0, Math.min(1, Number(similarity) || 0.02));
        const bl = Math.max(0, Math.min(1, Number(blend) || 0.0));

        // -------------------------
        // 1) 创建临时目录
        // -------------------------
        const timeDir = path.join(TEMP_ROOT, getCurrentTimeDir() + '_' + uuidv4());
        await fsPromises.mkdir(timeDir, { recursive: true });
        console.log(`📂 临时文件目录: ${timeDir}`);

        // -------------------------
        // 2) 保存 base64 图片
        // -------------------------
        let base64 = image;
        let ext = "png";

        const match = base64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
            ext = match[1].split("/")[1];
            base64 = match[2];
        }

        const id = uuidv4();
        const srcFile = path.join(timeDir, `${id}.${ext}`);
        await saveBase64Image(base64, srcFile);
        console.log(`💾 保存临时图片: ${srcFile}`);

        const paletteFile = path.join(timeDir, "palette.png");
        const outputGif = path.join(timeDir, "output.gif");

        // -------------------------
        // 3) Step1 生成调色板
        // -------------------------
        const paletteArgs = [
            "-y",
            "-i", srcFile,
            "-vf", `colorkey=${safeColor}:${sim}:${bl},palettegen`,
            paletteFile
        ];
        await runExecCmd(paletteArgs);

        // -------------------------
        // 4) Step2 使用调色板生成最终 GIF
        // -------------------------
        const gifArgs = [
            "-y",
            "-i", srcFile,
            "-i", paletteFile,
            "-lavfi",
            `colorkey=${safeColor}:${sim}:${bl} [ck]; [ck][1:v] paletteuse`,
            outputGif
        ];
        await runExecCmd(gifArgs);

        // -------------------------
        // 5) 返回 Base64
        // -------------------------
        if (!fs.existsSync(outputGif)) {
            return res.status(500).json({ error: "合成失败：未生成 GIF 文件" });
        }

        const buffer = await fsPromises.readFile(outputGif);

        console.log("🎉 GIF 合成完成，返回 Base64");

        res.json({
            code: 200,
            msg: "合成成功",
            data: {
                ext: "gif",
                color: safeColor,
                similarity: sim,
                blend: bl,
                base64: `data:image/gif;base64,${buffer.toString("base64")}`
            }
        });

    } catch (err) {
        console.error("❌ 合并接口失败:", err);
        res.status(500).json({code: 500, msg: "ffmpeg合成服务器错误" + err.message});
    }
});


/**
 * 合成图接口
 */
app.post('/ffmpeg/synthesis', async (req, res) => {
    try {
        console.log("📥 接收到素材图片合成请求");

        // 图片 x坐标 y坐标 旋转度数 素材图
        const {
            image = "",
            x = "300",
            y = "150",
            rotate = "0",
            material = ""
        } = req.body;

        if (!image) {
            return res.status(400).json({ error: "没有提供图片" });
        }
        if (!material) {
            return res.status(400).json({ error: "没有提供素材图片" });
        }
        // -------------------------
        // 1) 创建临时目录
        // -------------------------
        const timeDir = path.join(TEMP_ROOT, getCurrentTimeDir() + '_' + uuidv4());
        await fsPromises.mkdir(timeDir, { recursive: true });
        console.log(`📂 临时文件目录: ${timeDir}`);

        // -------------------------
        // 2) 保存 base64 图片
        // -------------------------
        let base64 = image;
        let ext = "png";

        const match = base64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
            ext = match[1].split("/")[1];
            base64 = match[2];
        }

        const id = uuidv4();
        const srcFile = path.join(timeDir, `${id}.${ext}`);
        await saveBase64Image(base64, srcFile);
        console.log(`💾 保存临时图片: ${srcFile}`);

        const outputFile = path.join(timeDir, "output.png");
        // -------------------------
        // 3) 复制素材图片到临时目录
        // -------------------------
        // 定义目标位置
        const materialExt = material + '.png';
        const materialFile = path.join(timeDir, materialExt);
        // 读取素材图
        await fsPromises.copyFile(path.join(IMAGE_ROOT, materialExt), materialFile);
        console.log(`🧩 素材已复制到: ${materialFile}`);
        // -------------------------
        // 4) 将素材图合并到主图
        // -------------------------
        const gifArgs = [
            "-y",
            "-i", srcFile,
            "-i", materialFile,
            "-filter_complex",
            `[1:v]scale=300:-1,rotate=${rotate}:ow=rotw(iw):oh=roth(ih):c=none[wm];[0:v][wm]overlay=${x}:${y}`,
            outputFile
        ];
        await runExecCmd(gifArgs);

        // -------------------------
        // 5) 返回 Base64
        // -------------------------
        if (!fs.existsSync(outputFile)) {
            return res.status(500).json({ error: "合成失败：未生成 GIF 文件" });
        }

        const buffer = await fsPromises.readFile(outputFile);

        console.log("🎉 GIF 合成完成，返回 Base64");

        res.json({
            code: 200,
            msg: "合成成功",
            data: {
                base64: `data:image/gif;base64,${buffer.toString("base64")}`
            }
        });

    } catch (err) {
        console.error("❌ 合并接口失败:", err);
        res.status(500).json({code: 500, msg: "ffmpeg合成服务器错误" + err.message});
    }
});



// ======================================================================
// 启动服务器
// ======================================================================
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
