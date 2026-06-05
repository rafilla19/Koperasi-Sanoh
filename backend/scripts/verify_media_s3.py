#!/usr/bin/env python3
import os, sys, json

# Ensure project root is on path
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.conf import settings
import boto3

print('MEDIA_ROOT=', settings.MEDIA_ROOT)
print('BUCKET=', settings.AWS_STORAGE_BUCKET_NAME)

client = boto3.client(
    's3',
    endpoint_url=getattr(settings, 'AWS_S3_ENDPOINT_URL', None),
    aws_access_key_id=getattr(settings, 'AWS_ACCESS_KEY_ID', None),
    aws_secret_access_key=getattr(settings, 'AWS_SECRET_ACCESS_KEY', None),
    region_name=getattr(settings, 'AWS_S3_REGION_NAME', None),
)

# list s3 keys
keys = []
try:
    paginator = client.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=settings.AWS_STORAGE_BUCKET_NAME):
        for obj in page.get('Contents', []) if page.get('Contents') else []:
            keys.append(obj['Key'])
except Exception as e:
    print('Error listing S3 objects:', e)

print('S3_OBJECT_COUNT=', len(keys))

# list local media files
media_root = settings.MEDIA_ROOT
local_files = []
if os.path.isdir(media_root):
    for root, dirs, files in os.walk(media_root):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, media_root).replace('\\', '/')
            local_files.append(rel)

print('LOCAL_MEDIA_COUNT=', len(local_files))

# compare
local_set = set(local_files)
s3_set = set(keys)
missing_in_s3 = sorted(list(local_set - s3_set))
only_in_s3 = sorted(list(s3_set - local_set))

print('MISSING_IN_S3_COUNT=', len(missing_in_s3))
print('ONLY_IN_S3_COUNT=', len(only_in_s3))
print('SAMPLE_MISSING_IN_S3=', missing_in_s3[:50])
print('SAMPLE_ONLY_IN_S3=', only_in_s3[:50])

report = {
    's3_count': len(keys),
    'local_count': len(local_files),
    'missing_in_s3_count': len(missing_in_s3),
    'only_in_s3_count': len(only_in_s3),
    'missing_in_s3_sample': missing_in_s3[:200],
    'only_in_s3_sample': only_in_s3[:200],
}

with open(os.path.join(BASE_DIR, 'media_s3_report.json'), 'w', encoding='utf8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print('Report written to', os.path.join(BASE_DIR, 'media_s3_report.json'))
