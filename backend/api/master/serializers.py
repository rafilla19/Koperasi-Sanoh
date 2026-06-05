from rest_framework import serializers
from .models import DocumentArchive, DocumentType


class DocumentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentType
        fields = ['id', 'name']


class DocumentArchiveSerializer(serializers.ModelSerializer):
    type_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = DocumentArchive
        fields = [
            'id',
            'title',
            'description',
            'type_id',
            'type_name',
            'document_url',
            'file_name',
            'file_size',
            'uploaded_at',
        ]
        read_only_fields = ['id', 'uploaded_at', 'type_name']

    def get_type_name(self, obj):
        if obj.type_id:
            try:
                return DocumentType.objects.get(pk=obj.type_id).name
            except DocumentType.DoesNotExist:
                return None
        return None
