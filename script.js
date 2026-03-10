// 1. Configuration & Data Loading
let dictionary = {};
const worker = Tesseract.createWorker();

// Load your new dictionary.json from GitHub
async function initApp() {
    try {
        const response = await fetch('dictionary.json');
        dictionary = await response.json();
        console.log("Dictionary loaded! 📘");
        
        // Initialize OCR with Simplified Chinese only
        await worker.load();
        await worker.loadLanguage('chi_sim');
        await worker.initialize('chi_sim');
        // Setting a whitelist helps accuracy: only look for Hanzi
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789，。！？；：“”（）—《》', 
            // Note: Tesseract handles Hanzi best when not strictly whitelisted, 
            // but we've removed English letters from the "noise" search.
        });
        console.log("OCR Ready! 📷");
    } catch (e) {
        console.error("Initialization failed", e);
    }
}

initApp();

// 2. Camera Handling
const video = document.getElementById('camera');
const captureBtn = document.getElementById('capture-btn');

navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: "environment" } 
}).then(stream => {
    video.srcObject = stream;
});

// 3. The Recognition "Vibe"
captureBtn.onclick = async () => {
    // UI Feedback: Show loading
    document.getElementById('step1').classList.remove('active');
    document.getElementById('step2').classList.add('active');
    document.getElementById('camera-section').classList.remove('active');
    document.getElementById('text-section').classList.add('active');
    document.getElementById('loading').style.display = 'block';

    // Capture frame from video
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    // OCR Process
    const { data: { text } } = await worker.recognize(canvas);
    displayRecognizedText(text);
};

// 4. Smart Text Display (Breaking into clickable characters/words)
function displayRecognizedText(text) {
    const container = document.getElementById('recognized-text');
    document.getElementById('loading').style.display = 'none';
    container.innerHTML = '';

    // Clean the text and split into characters
    // For kids, we'll start with character-by-character clicking
    const chars = text.replace(/\s+/g, '').split('');

    chars.forEach(char => {
        const span = document.createElement('span');
        span.className = 'clickable-char';
        span.innerText = char;
        span.onclick = () => lookUpWord(char);
        container.appendChild(span);
    });
}

// 5. Dictionary Lookup (Using your JSON)
function lookUpWord(word) {
    const entry = dictionary[word];
    
    // Move to Step 3 UI
    document.getElementById('step2').classList.remove('active');
    document.getElementById('step3').classList.add('active');
    document.getElementById('text-section').classList.remove('active');
    document.getElementById('word-detail').classList.add('active');

    // Fill the card with info from JSON
    document.getElementById('current-word').innerText = word;
    
    if (entry) {
        document.getElementById('word-pinyin').innerText = entry.pinyin || "---";
        document.getElementById('word-meaning').innerHTML = `<strong>English:</strong> ${entry.english}`;
    } else {
        document.getElementById('word-pinyin').innerText = "Pinyin not found";
        document.getElementById('word-meaning').innerText = "Looking for definition... / 找不到解释";
    }

    // Auto-speak the word using iPad's built-in voice
    speak(word);
}

// 6. Text-to-Speech (Free & Works Offline on iPad)
function speak(text) {
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'zh-CN';
    msg.rate = 0.8; // Slightly slower for kids
    window.speechSynthesis.speak(msg);
}

document.getElementById('speak-btn').onclick = () => {
    const word = document.getElementById('current-word').innerText;
    speak(word);
};

// Back Buttons
document.getElementById('back-to-camera').onclick = () => location.reload();
document.getElementById('back-to-text').onclick = () => {
    document.getElementById('word-detail').classList.remove('active');
    document.getElementById('text-section').classList.add('active');
};
