/**
 * FFmpeg API测试工具 - 工具函数
 */

/**
 * 更新文件上传输入框的显示文件名
 */
function initFileUploadDisplay() {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        input.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                this.setAttribute('data-filename', this.files[0].name);
            } else {
                this.removeAttribute('data-filename');
            }
        });
    });
}

/**
 * 生成随机ID
 */
function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 模拟进度更新
 * @param {Function} progressCallback 进度回调函数
 * @param {number} duration 总持续时间（毫秒）
 * @returns {Function} 取消函数
 */
function simulateProgress(progressCallback, duration = 3000) {
    let startTime = Date.now();
    let lastProgress = 0;
    let cancelled = false;
    
    function updateProgress() {
        if (cancelled) return;
        
        const elapsed = Date.now() - startTime;
        let progress = Math.min(100, (elapsed / duration) * 100);
        
        // 添加一些随机波动使其看起来更真实
        const randomFactor = (Math.random() - 0.5) * 2;
        progress = Math.max(lastProgress, Math.min(99, progress + randomFactor));
        
        lastProgress = progress;
        progressCallback(progress);
        
        if (progress < 100) {
            requestAnimationFrame(updateProgress);
        }
    }
    
    updateProgress();
    
    return () => {
        cancelled = true;
        progressCallback(100);
    };
}

/**
 * 验证文件类型和大小
 * @param {File} file 文件对象
 * @param {Array} allowedTypes 允许的MIME类型数组
 * @param {number} maxSizeMB 最大文件大小（MB）
 * @returns {Object} 验证结果 {isValid: boolean, error: string}
 */
function validateFile(file, allowedTypes, maxSizeMB = 50) {
    if (!file) {
        return { isValid: false, error: '请选择文件' };
    }
    
    // 验证文件类型
    const isValidType = allowedTypes.some(type => 
        file.type === type || file.name.endsWith('.' + type.split('/')[1])
    );
    
    if (!isValidType) {
        return { isValid: false, error: '不支持的文件类型' };
    }
    
    // 验证文件大小
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
        return { isValid: false, error: `文件大小不能超过 ${maxSizeMB}MB` };
    }
    
    return { isValid: true, error: null };
}

/**
 * 格式化文件大小
 * @param {number} bytes 字节数
 * @returns {string} 格式化后的大小字符串
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 处理API响应错误
 * @param {Response} response Fetch响应对象
 * @returns {Promise<Object>} 格式化的错误对象
 */
async function handleApiError(response) {
    try {
        const errorData = await response.json();
        return {
            status: response.status,
            message: errorData.error || errorData.message || '未知错误',
            details: errorData
        };
    } catch (e) {
        return {
            status: response.status,
            message: response.statusText || '网络错误',
            details: null
        };
    }
}

/**
 * 设置本地存储
 * @param {string} key 存储键名
 * @param {*} value 存储值
 */
function setLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn('无法保存到本地存储:', error);
    }
}

/**
 * 获取本地存储
 * @param {string} key 存储键名
 * @param {*} defaultValue 默认值
 * @returns {*} 存储的值或默认值
 */
function getLocalStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.warn('无法从本地存储读取:', error);
        return defaultValue;
    }
}

/**
 * 保存API设置到本地存储
 */
function saveApiSettings() {
    const apiBaseUrl = document.getElementById('api-base-url')?.textContent;
    if (apiBaseUrl) {
        setLocalStorage('ffmpegApiBaseUrl', apiBaseUrl);
    }
}

/**
 * 从本地存储加载API设置
 */
function loadApiSettings() {
    const savedUrl = getLocalStorage('ffmpegApiBaseUrl');
    if (savedUrl && document.getElementById('api-base-url')) {
        document.getElementById('api-base-url').textContent = savedUrl;
    }
}

/**
 * 初始化工具函数
 */
function initUtils() {
    initFileUploadDisplay();
    loadApiSettings();
    
    // 监听窗口关闭事件，保存设置
    window.addEventListener('beforeunload', saveApiSettings);
}

// 导出函数供主页面使用
window.ffmpegUtils = {
    initUtils,
    generateId,
    simulateProgress,
    validateFile,
    formatFileSize,
    handleApiError,
    setLocalStorage,
    getLocalStorage,
    saveApiSettings,
    loadApiSettings
};