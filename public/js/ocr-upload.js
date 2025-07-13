const ocrForm = document.getElementById('ocrForm');
const ocrImage = document.getElementById('ocrImage');
const ocrImageData = document.getElementById('ocr_image_data');
const ocrStatus = document.getElementById('ocrStatus');
if (ocrForm) {
  ocrForm.onsubmit = function(e) {
    if (!ocrImage.files[0]) {
      ocrStatus.textContent = 'Please select an image.';
      e.preventDefault();
      return false;
    }
    const reader = new FileReader();
    reader.onloadend = function() {
      ocrImageData.value = reader.result.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      ocrForm.submit();
    };
    reader.readAsDataURL(ocrImage.files[0]);
    e.preventDefault();
    ocrStatus.textContent = 'Processing image...';
    return false;
  };
} 