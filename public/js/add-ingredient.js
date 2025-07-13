let mediaRecorder;
let audioChunks = [];
let isRecording = false;

function selectMethod(method) {
    console.log('Sélection de la méthode :', method);
    
    document.querySelectorAll('.input-method').forEach(el => {
        el.classList.remove('active');
    });
    
    document.querySelectorAll('#text-input, #voice-input, #barcode-input, #image-input').forEach(el => {
        el.style.display = 'none';
    });
    
    document.querySelector(`[data-method="${method}"]`).classList.add('active');
    document.getElementById('input_type').value = method;
    
    if (method === 'text') {
        document.getElementById('text-input').style.display = 'block';
        setTimeout(() => document.getElementById('text_data').focus(), 100);
    } else if (method === 'voice') {
        document.getElementById('voice-input').style.display = 'block';
        initializeVoiceRecording();
    } else if (method === 'barcode') {
        document.getElementById('barcode-input').style.display = 'block';
        setTimeout(() => document.getElementById('barcode').focus(), 100);
    } else if (method === 'ocr' || method === 'photo') {
        document.getElementById('image-input').style.display = 'block';
    }
    
    document.getElementById('ingredientForm').style.display = 'block';
}

function initializeVoiceRecording() {
    const startBtn = document.getElementById('startRecording');
    const stopBtn = document.getElementById('stopRecording');
    const status = document.getElementById('recordingStatus');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Votre navigateur ne supporte pas l\'enregistrement audio');
        return;
    }
    
    startBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            convertAudioToBase64(audioBlob);
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        document.getElementById('startRecording').style.display = 'none';
        document.getElementById('stopRecording').style.display = 'inline-block';
        document.getElementById('recordingStatus').style.display = 'block';
        
    } catch (error) {
        console.error('Erreur lors de l\'accès au microphone:', error);
        alert('Impossible d\'accéder au microphone. Vérifiez les permissions.');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        document.getElementById('startRecording').style.display = 'inline-block';
        document.getElementById('stopRecording').style.display = 'none';
        document.getElementById('recordingStatus').style.display = 'none';
    }
}

function convertAudioToBase64(audioBlob) {
    const reader = new FileReader();
    reader.onload = function() {
        const base64Audio = reader.result.split(',')[1];
        document.getElementById('audio_data').value = base64Audio;
        
        transcribeAudio(base64Audio);
    };
    reader.readAsDataURL(audioBlob);
}

async function transcribeAudio(base64Audio) {
    try {
        const preview = document.getElementById('transcriptionPreview');
        const text = document.getElementById('transcriptionText');
        preview.style.display = 'block';
        text.innerHTML = 'Transcription en cours...';
        
        const formData = new FormData();
        
        const byteCharacters = atob(base64Audio);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const audioBlob = new Blob([byteArray], { type: 'audio/wav' });
        
        formData.append('audio', audioBlob, 'audio.wav');
        
        const response = await fetch('/ingredients/transcribe', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.transcription) {
            text.innerHTML = result.transcription;
        } else {
            text.innerHTML = 'Erreur de transcription';
        }
        
    } catch (error) {
        console.error('Erreur de transcription:', error);
        document.getElementById('transcriptionText').innerHTML = 'Erreur de transcription';
    }
}

function resetForm() {
    if (isRecording) {
        stopRecording();
    }
    
    document.getElementById('ingredientForm').style.display = 'none';
    document.querySelectorAll('.input-method').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById('ingredientForm').reset();
    
    document.getElementById('transcriptionPreview').style.display = 'none';
    document.getElementById('audio_data').value = '';
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM chargé, configuration des listeners');
    
    document.querySelectorAll('.input-method').forEach(method => {
        method.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const methodType = this.getAttribute('data-method');
            console.log('Méthode cliquée :', methodType);
            selectMethod(methodType);
        });
    });
    
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function(e) {
            e.preventDefault();
            resetForm();
        });
    }
    
    const form = document.getElementById('ingredientForm');
    if (form) {
        form.addEventListener('submit', function() {
            const submitBtn = this.querySelector('button[type="submit"]');
            const btnText = submitBtn.querySelector('.btn-text');
            const loading = submitBtn.querySelector('.loading');
            
            if (btnText && loading) {
                btnText.style.display = 'none';
                loading.style.display = 'inline-block';
                submitBtn.disabled = true;
            }
        });
    }
});
