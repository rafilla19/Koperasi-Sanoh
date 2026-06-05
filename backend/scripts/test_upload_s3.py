#!/usr/bin/env python3
import os, sys, io
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.conf import settings
import boto3

print('Using storage:', default_storage.__class__)

# create test content
content = b'Test upload from verify script\n'
filename = 'test_uploads/test_file_from_script.txt'
file_obj = ContentFile(content, name='test_file_from_script.txt')

saved_path = default_storage.save(filename, file_obj)
print('Saved path:', saved_path)

# Try to get URL via storage if supported
try:
    url = default_storage.url(saved_path)
except Exception as e:
    url = None
print('URL:', url)

# Verify object exists in S3 via boto3
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

# cleanup: optionally delete the test object from bucket
# client.delete_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=saved_path)

print('Done.')
