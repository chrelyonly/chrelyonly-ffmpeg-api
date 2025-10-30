// ffmpeg配置文件
const ffmpeg = require('fluent-ffmpeg');

// 设置FFmpeg路径
ffmpeg.setFfmpegPath('D:\\dev\\dev\\ffmpeg\\bin\\ffmpeg.exe');
ffmpeg.setFfprobePath('D:\\dev\\dev\\ffmpeg\\bin\\ffprobe.exe');

// 导出配置好的ffmpeg实例
module.exports = ffmpeg;