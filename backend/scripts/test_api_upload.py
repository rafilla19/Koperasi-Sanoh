#!/usr/bin/env python3
import os, sys
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from rest_framework.test import APIRequestFactory
from backend.api.member.views import MemberViewSet
from django.core.files.uploadedfile import SimpleUploadedFile

# Create PNG bytes (1x1)
png_bytes = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
    b'\x00\x00\x00\x0cIDATx\x9cc``\x00\x00\x00\x02\x00\x01\xe2!\xbc\x33\x00\x00\x00\x00IEND\xaeB`\x82'
)

factory = APIRequestFactory()
file = SimpleUploadedFile('api_test.png', png_bytes, content_type='image/png')
request = factory.post('/api/member/upload_temp_document/', {'file': file, 'type': 'ktp'}, format='multipart')

view = MemberViewSet.as_view({'post': 'upload_temp_document'})
response = view(request)

print('Status code:', response.status_code)
try:
    data = response.data
except Exception:
    data = response.rendered_content

print('Response:', data)

# If response contains URL, check existence via storage
if isinstance(data, dict) and data.get('file_path'):
    print('File path returned:', data.get('file_path'))

print('Done')
