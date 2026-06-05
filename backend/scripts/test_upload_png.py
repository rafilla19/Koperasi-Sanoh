#!/usr/bin/env python3
import os, sys
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.conf import settings
import boto3

# 1x1 transparent PNG
png_bytes = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
    b'\x00\x00\x00\x0cIDATx\x9cc``\x00\x00\x00\x02\x00\x01\xe2!\xbc\x33\x00\x00\x00\x00IEND\xaeB`\x82'
)

filename = 'test_uploads/test_image_from_script.png'
file_obj = ContentFile(png_bytes, name='test_image_from_script.png')

print('Using storage:', default_storage.__class__)
saved_path = default_storage.save(filename, file_obj)
print('Saved path:', saved_path)
try:
    url = default_storage.url(saved_path)
except Exception as e:
    url = None
print('URL:', url)

client = boto3.client(
    's3',
    endpoint_url=getattr(settings, 'AWS_S3_ENDPOINT_URL', None),
    aws_access_key_id=getattr(settings, 'AWS_ACCESS_KEY_ID', None),
    aws_secret_access_key=getattr(settings, 'AWS_SECRET_ACCESS_KEY', None),
    region_name=getattr(settings, 'AWS_S3_REGION_NAME', None),
)

def object_exists(key):
    try:
        client.head_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=key)
        return True
    except Exception:
        return False

exists = object_exists(saved_path)
print('Object exists in bucket:', exists)
print('Done.')
