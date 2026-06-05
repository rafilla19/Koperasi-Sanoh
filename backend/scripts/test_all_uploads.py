#!/usr/bin/env python3
import os, sys
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.core.files.uploadedfile import SimpleUploadedFile
from backend.api.member.views import _persist_member_document, MemberViewSet
from django.test.client import RequestFactory
from rest_framework.test import APIRequestFactory
from django.core.files.storage import default_storage
from django.conf import settings
import boto3

# prepare boto3 client
client = boto3.client(
    's3',
    endpoint_url=getattr(settings, 'AWS_S3_ENDPOINT_URL', None),
    aws_access_key_id=getattr(settings, 'AWS_ACCESS_KEY_ID', None),
    aws_secret_access_key=getattr(settings, 'AWS_SECRET_ACCESS_KEY', None),
    region_name=getattr(settings, 'AWS_S3_REGION_NAME', None),
)

def exists_in_bucket(key):
    try:
        client.head_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=key)
        return True
    except Exception:
        return False

print('Testing KTP/NPWP persistence via _persist_member_document')
png_bytes = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
    b'\x00\x00\x00\x0cIDATx\x9cc``\x00\x00\x00\x02\x00\x01\xe2!\xbc\x33\x00\x00\x00\x00IEND\xaeB`\x82'
)
file_ktp = SimpleUploadedFile('ktp_test.png', png_bytes, content_type='image/png')
file_npwp = SimpleUploadedFile('npwp_test.png', png_bytes, content_type='image/png')

saved_ktp = _persist_member_document(file_ktp, 'members/ktp')
saved_npwp = _persist_member_document(file_npwp, 'members/npwp')
print('saved_ktp:', saved_ktp)
print('saved_npwp:', saved_npwp)
print('exists ktp in bucket:', exists_in_bucket(saved_ktp) if saved_ktp else None)
print('exists npwp in bucket:', exists_in_bucket(saved_npwp) if saved_npwp else None)

# Test loan slip save via default_storage
print('\nTesting loan slip save via default_storage')
loan_key = 'loan/slip_gaji/test_salary_slip.png'
saved_loan = default_storage.save(loan_key, SimpleUploadedFile('salary.png', png_bytes, content_type='image/png'))
print('saved_loan:', saved_loan)
print('exists loan in bucket:', exists_in_bucket(saved_loan))

# Test upload_transfer_file endpoint
print('\nTesting upload_transfer_file endpoint via APIRequestFactory')
factory = APIRequestFactory()
transfer_file = SimpleUploadedFile('transfer_test.png', png_bytes, content_type='image/png')
request = factory.post('/api/member/upload_transfer_file/', {'file': transfer_file}, format='multipart')
view = MemberViewSet.as_view({'post': 'upload_transfer_file'})
response = view(request)
print('upload_transfer_file status:', response.status_code)
print('upload_transfer_file data:', getattr(response, 'data', response.rendered_content))

# If response returned a full URL, check presence in bucket by parsing path
resp = response.data if hasattr(response, 'data') else None
if isinstance(resp, dict) and resp.get('file_path'):
    url = resp['file_path']
    # extract path after '/storage/v1/s3/<bucket>/' or after MEDIA_URL
    if '/storage/v1/s3/' in url:
        key = url.split('/storage/v1/s3/')[1].split('/', 1)[1]
    else:
        key = url.replace(settings.MEDIA_URL, '').lstrip('/')
    print('parsed key:', key)
    print('exists in bucket:', exists_in_bucket(key))

print('\nAll tests completed')
