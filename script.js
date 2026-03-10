// 全局状态
let state = {
    currentSection: 'camera',
    cameraStream: null,
    currentCamera: 'environment',
    recognizedText: '',
    currentWord: null,
    vocabulary: JSON.parse(localStorage.getItem('vocabulary')) || {},
    isRecording: false
};

// DOM 元素
const elements = {
    camera: document.getElementById('camera'),
    captureBtn: document.getElementById('capture-btn'),
    switchCamera: document.getElementById('switch-camera'),
    recognizedText: document.getElementById('recognized-text'),
    loading: document.getElementById('loading'),
    speakBtn: document.getElementById('speak-btn'),
    recordBtn: document.getElementById('record-btn'),
    vocabList: document.getElementById('vocab-list'),
    recordingIndicator: document.getElementById('recording-indicator')
};

// 初始化函数
async function init() {
    setupEventListeners();
    await initCamera();
    loadVocabulary();
    checkPWAInstall();
}

// 设置事件监听
function setupEventListeners() {
    // 拍照按钮
    elements.captureBtn.addEventListener('click', capturePhoto);
    
    // 切换摄像头
    elements.switchCamera.addEventListener('click', toggleCamera);
    
    // 返回按钮
    document.getElementById('back-to-camera').addEventListener('click', () => switchSection('camera'));
    document.getElementById('back-to-text').addEventListener('click', () => switchSection('text'));
    
    // 发音按钮
    elements.speakBtn.addEventListener('click', speakCurrentWord);
    
    // 跟读按钮
    elements.recordBtn.addEventListener('click', toggleRecording);
    
    // 清空生词本
    document.getElementById('clear-vocab').addEventListener('click', clearVocabulary);
    
    // 添加到主屏幕提示
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
}

// 初始化摄像头
async function initCamera() {
    try {
        const constraints = {
            video: {
                facingMode: state.currentCamera,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        state.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        elements.camera.srcObject = state.cameraStream;
    } catch (err) {
        alert('无法访问摄像头: ' + err.message);
    }
}

// 切换摄像头
async function toggleCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
    }
    
    state.currentCamera = state.currentCamera === 'environment' ? 'user' : 'environment';
    await initCamera();
}

// 拍照并识别
async function capturePhoto() {
    try {
        switchSection('text');
        elements.loading.style.display = 'block';
        elements.recognizedText.innerHTML = '';
        
        // 创建画布拍照
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = elements.camera.videoWidth;
        canvas.height = elements.camera.videoHeight;
        context.drawImage(elements.camera, 0, 0);
        
        // 使用Tesseract识别
        const { data: { text } } = await Tesseract.recognize(
            canvas.toDataURL('image/jpeg'),
            'chi_sim+eng', // 中文+英文
            {
                logger: m => console.log('OCR进度:', m)
            }
        );
        
        // 处理识别结果
        processRecognizedText(text);
        
    } catch (err) {
        alert('识别失败: ' + err.message);
        switchSection('camera');
    } finally {
        elements.loading.style.display = 'none';
    }
}

// 处理识别文本
function processRecognizedText(text) {
    state.recognizedText = text;
    
    // 分割成词语（简单的中文分词）
    const words = text.split('').filter(char => char.trim());
    
    // 生成可点击的词语
    elements.recognizedText.innerHTML = words.map(word => `
        <span class="word" onclick="selectWord('${word}')" 
              data-pinyin="${getPinyin(word)}">
            ${word}
        </span>
    `).join('');
}

// 选择词语
async function selectWord(word) {
    state.currentWord = word;
    switchSection('detail');
    
    // 更新UI
    document.getElementById('current-word').textContent = word;
    document.getElementById('word-pinyin').textContent = getPinyin(word);
    
    // 获取词语解释
    const meaning = await getWordMeaning(word);
    document.getElementById('word-meaning').textContent = meaning;
    
    // 生成例句
    document.getElementById('word-example').innerHTML = 
        getExampleSentence(word).replace(word, `<mark>${word}</mark>`);
    
    // 更新学习次数
    updateVocabulary(word);
    
    // 自动发音
    setTimeout(() => speakWord(word), 300);
}

// 语音合成
function speakWord(word) {
    if (!window.speechSynthesis) {
        alert('您的浏览器不支持语音合成');
        return;
    }
    
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.8;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    // 获取中文语音
    const chineseVoice = speechSynthesis.getVoices().find(voice => 
        voice.lang.includes('zh') || voice.lang.includes('CN')
    );
    
    if (chineseVoice) {
        utterance.voice = chineseVoice;
    }
    
    speechSynthesis.speak(utterance);
}

// 发音当前词语
function speakCurrentWord() {
    if (state.currentWord) {
        speakWord(state.currentWord);
    }
}

// 跟读功能
async function toggleRecording() {
    if (state.isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.mediaRecorder = new MediaRecorder(stream);
        state.audioChunks = [];
        
        state.mediaRecorder.ondataavailable = event => {
            state.audioChunks.push(event.data);
        };
        
        state.mediaRecorder.onstop = () => {
            const audioBlob = new Blob(state.audioChunks, { type: 'audio/wav' });
            comparePronunciation(audioBlob);
        };
        
        state.mediaRecorder.start();
        state.isRecording = true;
        elements.recordingIndicator.style.display = 'flex';
        
    } catch (err) {
        alert('无法访问麦克风: ' + err.message);
    }
}

function stopRecording() {
    if (state.mediaRecorder) {
        state.mediaRecorder.stop();
        state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        state.isRecording = false;
        elements.recordingIndicator.style.display = 'none';
    }
}

// 拼音转换（简单版）
function getPinyin(word) {
    // 这里应该使用拼音库，如pinyin.js
    // 简化处理：返回占位符
    return word.split('').map(() => 'pīn yīn').join(' ');
}

// 获取词语解释
async function getWordMeaning(word) {
    try {
        // 使用有道词典API（需要申请key）
        const response = await fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`);
        const data = await response.json();
        
        if (data.basic && data.basic.explains) {
            return data.basic.explains[0];
        }
    } catch (err) {
        console.log('API调用失败，使用本地数据');
    }
    
    // 备用本地数据
    const localMeanings = {
        '苹果': '一种常见水果，圆形，味道甜美，富含维生素。',
        '学习': '通过阅读、听讲、研究、实践等获得知识或技能的过程。',
        '老师': '在学校中传授知识、技能的人。',
        '学生': '在学校学习的人。',
        '书本': '装订成册的著作。',
        '电脑': '用于计算、编程、娱乐的电子设备。'
    };
    
    return localMeanings[word] || '暂无解释，请查询词典。';
}

// 生成例句
function getExampleSentence(word) {
    const examples = {
        '苹果': '我今天吃了一个红红的苹果。',
        '学习': '我们要好好学习，天天向上。',
        '老师': '老师正在教我们认识新的汉字。',
        '学生': '学生们在教室里认真听课。',
        '书本': '我把书本整齐地放进了书包。',
        '电脑': '我用电脑来学习和玩游戏。'
    };
    
    return examples[word] || `这是一个关于"${word}"的例句。`;
}

// 更新生词本
function updateVocabulary(word) {
    if (!state.vocabulary[word]) {
        state.vocabulary[word] = {
            count: 0,
            firstLearned: new Date().toISOString(),
            lastReviewed: new Date().toISOString()
        };
    }
    
    state.vocabulary[word].count++;
    state.vocabulary[word].lastReviewed = new Date().toISOString();
    
    localStorage.setItem('vocabulary', JSON.stringify(state.vocabulary));
    loadVocabulary();
}

// 加载生词本
function loadVocabulary() {
    const vocabList = document.getElementById('vocab-list');
    const words = Object.keys(state.vocabulary);
    
    if (words.length === 0) {
        vocabList.innerHTML = '<p class="empty-tip">点击词语会自动添加到这里</p>';
        return;
    }
    
    vocabList.innerHTML = words
        .sort((a, b) => state.vocabulary[b].count - state.vocabulary[a].count)
        .slice(0, 10) // 只显示前10个
        .map(word => `
            <div class="vocab-item" onclick="selectWord('${word}')">
                <span>${word}</span>
                <span class="count">${state.vocabulary[word].count}次</span>
            </div>
        `).join('');
}

// 清空生词本
function clearVocabulary() {
    if (confirm('确定要清空生词本吗？')) {
        state.vocabulary = {};
        localStorage.removeItem('vocabulary');
        loadVocabulary();
    }
}

// 切换界面
function switchSection(section) {
    // 更新步骤指示器
    document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
    document.querySelectorAll('.section').forEach(sect => sect.classList.remove('active'));
    
    switch(section) {
        case 'camera':
            document.getElementById('step1').classList.add('active');
            document.getElementById('camera-section').classList.add('active');
            break;
        case 'text':
            document.getElementById('step2').classList.add('active');
            document.getElementById('text-section').classList.add('active');
            break;
        case 'detail':
            document.getElementById('step3').classList.add('active');
            document.getElementById('word-detail').classList.add('active');
            break;
    }
    
    state.currentSection = section;
}

// PWA安装提示
let deferredPrompt;
function handleInstallPrompt(e) {
    e.preventDefault();
    deferredPrompt = e;
    
    // 显示安装提示
    if (!localStorage.getItem('pwaPromptShown')) {
        setTimeout(() => {
            if (confirm('添加到主屏幕可获得更好的使用体验，是否添加？')) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(choice => {
                    if (choice.outcome === 'accepted') {
                        console.log('用户添加了PWA');
                    }
                    deferredPrompt = null;
                });
            }
            localStorage.setItem('pwaPromptShown', 'true');
        }, 3000);
    }
}

// 检查是否已安装PWA
function checkPWAInstall() {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        console.log('正在以独立应用运行');
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', init);

// 暴露全局函数
window.selectWord = selectWord;
