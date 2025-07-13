const photoForm = document.getElementById('photoForm');
const photoImage = document.getElementById('photoImage');
const photoImageData = document.getElementById('photo_image_data');
const photoStatus = document.getElementById('photoStatus');
if (photoForm) {
  photoForm.onsubmit = function(e) {
    if (!photoImage.files[0]) {
      photoStatus.textContent = 'Please select an image.';
      e.preventDefault();
      return false;
    }
    const reader = new FileReader();
    reader.onloadend = function() {
      photoImageData.value = reader.result.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      photoForm.submit();
    };
    reader.readAsDataURL(photoImage.files[0]);
    e.preventDefault();
    photoStatus.textContent = 'Processing image...';
    return false;
  };
} 