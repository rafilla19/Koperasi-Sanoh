from rest_framework import serializers
from .models import WAConfig, WAQuestion


class WAConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = WAConfig
        fields = ['id', 'phone_number', 'is_active']


class WAQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WAQuestion
        fields = ['id', 'label', 'message', 'sort_order', 'is_active']
